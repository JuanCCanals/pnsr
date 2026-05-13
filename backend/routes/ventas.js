// /backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');
const PDFDocument = require('pdfkit');

// Validar suma de pagos
function validarSumaPagos(pagos, montoTotal) {
  const sumaPagos = pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
  const diferencia = Math.abs(sumaPagos - parseFloat(montoTotal));
  return diferencia <= 0.01; // Tolerancia de 1 centavo
}

// Generar el siguiente correlativo para una serie (T002 = Cajas del Amor).
// Lee desde la tabla `ventas` (a diferencia de cobros.js que lee de `comprobantes`).
async function generarCorrelativoVenta(conn, serie = 'T002') {
  const [rows] = await conn.query(
    'SELECT MAX(correlativo) AS max_corr FROM ventas WHERE serie = ?',
    [serie]
  );
  return (rows[0]?.max_corr || 0) + 1;
}

// Utilidad: obtener caja por c.codigo o por f.codigo_unico
async function getCajaByCodigo(connOrCodigo, maybeCodigo) {
  let conn = pool;
  let codigo = maybeCodigo;

  if (typeof connOrCodigo === 'string') {
    codigo = connOrCodigo;
  } else if (connOrCodigo && typeof connOrCodigo.query === 'function') {
    conn = connOrCodigo;
  }

  const [rows] = await conn.query(
    `SELECT 
      c.id            AS caja_id,
      c.codigo        AS caja_codigo,
      c.estado        AS caja_estado,
      c.benefactor_id AS caja_benefactor_id,
      c.familia_id    AS familia_id,
      f.zona_id       AS zona_id,
      f.codigo_unico  AS familia_codigo,
      f.nombre_padre, f.nombre_madre, f.direccion
      FROM familias f
      LEFT JOIN cajas c ON c.familia_id = f.id
      WHERE (c.codigo = ? OR f.codigo_unico = ?)
      LIMIT 1`,
    [codigo, codigo]
  );
  return rows[0];
}

// 🔎 Resolver lista de códigos (cajas.codigo o familias.codigo_unico)
async function resolveCajasByCodigos(conn, codigos) {
  if (!Array.isArray(codigos) || codigos.length === 0) {
    return { resolved: [], missing: [] };
  }
  const placeholders = codigos.map(() => '?').join(',');
  const sql = `
    SELECT 
      c.id,
      c.codigo,
      c.estado,
      f.codigo_unico
    FROM familias f
    LEFT JOIN cajas c ON c.familia_id = f.id
    WHERE 
      c.codigo IN (${placeholders})
      OR f.codigo_unico IN (${placeholders})
  `;
  const [rows] = await conn.query(sql, [...codigos, ...codigos]);

  const map = new Map();
  for (const r of rows) {
    if (r.codigo) map.set(String(r.codigo), r);
    if (r.codigo_unico) map.set(String(r.codigo_unico), r);
  }

  const resolved = [];
  const missing = [];
  for (const code of codigos) {
    const r = map.get(String(code));
    if (r && r.id) resolved.push(r);
    else missing.push(code);
  }
  return { resolved, missing };
}

// Benefactor genérico para modalidad S/160 (cajas internas / parroquia)
async function ensureGenericBenefactor(conn) {
  const nombre = 'PARROQUIA - VENTA INTERNA';
  const [rows] = await conn.query(
    'SELECT id FROM benefactores WHERE nombre = ? LIMIT 1',
    [nombre]
  );
  if (rows.length) return rows[0].id;

  const [ins] = await conn.query(
    'INSERT INTO benefactores (nombre, telefono, email, direccion) VALUES (?,?,?,?)',
    [nombre, null, null, null]
  );
  return ins.insertId;
}

// GET /api/ventas/box/:codigo
router.get('/box/:codigo', authenticateToken, authorizePermission('venta_cajas.leer'), async (req, res) => {
  try {
    const codigo = decodeURIComponent(req.params.codigo || '').trim();
    if (!codigo) return res.status(400).json({ success: false, error: 'Código requerido' });

    const caja = await getCajaByCodigo(codigo);
    if (!caja) return res.json({ success: false, error: 'No existe la caja' });

    const estado = String(caja.caja_estado || '').toLowerCase();
    if (estado && !['disponible', 'libre', ''].includes(estado)) {
      return res.json({ success: false, error: `Caja en estado: ${caja.caja_estado}` });
    }
    res.json({ success: true, data: caja });
  } catch (e) {
    console.error('GET /ventas/box/:codigo', e);
    res.status(500).json({ success: false, error: 'Error buscando caja' });
  }
});


// POST /api/ventas → registra venta y actualiza cajas + excedentes globales
router.post('/', authenticateToken, authorizePermission('venta_cajas.crear'), async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const body = req.body || {};

    const recibo          = body.recibo?.trim();
    const fecha           = body.fecha;
    const modalidad_id    = body.modalida_id || body.modalidad_id || null;
    const punto_venta_id  = body.punto_venta_id || null;
    const forma_pago_body = body.forma_pago || null;      // forma de pago "principal"
    const monto_body      = Number(body.monto || 0);      // monto "de referencia"
    const moneda          = body.moneda || 'PEN';
    const benefactor      = body.benefactor || null;      // { id?, nombres, apellidos, telefono, correo }
    const codigos         = Array.isArray(body.codigos) ? body.codigos : [];

    const fecha_devolucion = body.fecha_devolucion || null;
    const observaciones    = body.obs || body.observaciones || null;

    // 🔹 Declarar benefactorId al inicio, fuera de cualquier TDZ
    let benefactorId = null;

    // Pagos (modelo nuevo desde el frontend)
    let pagos = Array.isArray(body.pagos) ? body.pagos : [];

    pagos = pagos
      .map((p) => ({
        forma_pago: p.forma_pago || forma_pago_body || 'Efectivo',
        monto: Number(p.monto || 0),
        fecha: p.fecha || fecha,
        fecha_operacion: p.fecha_operacion || p.op_fecha || null,
        hora_operacion:  p.hora_operacion  || p.op_hora  || null,
        nro_operacion:   p.nro_operacion   || p.op_numero || null,
        obs_operacion:   p.obs_operacion   || p.op_obs   || null,
      }))
      .filter((p) => p.monto > 0);

    const is40  = Number(modalidad_id) === 1;
    const is160 = Number(modalidad_id) === 2;

    // Requeridos mínimos
    if (!recibo?.trim() || !fecha || !Number(modalidad_id) || !Number(punto_venta_id)) {
      conn.release();
      return res.status(400).json({
        success: false,
        error: 'recibo, fecha, modalidad_id y punto_venta_id son obligatorios'
      });
    }

    // Si no vino array de pagos y NO es "Con excedente", generamos uno por compatibilidad
    if (pagos.length === 0 && forma_pago_body !== 'Con excedente' && monto_body > 0) {
      pagos.push({
        forma_pago: forma_pago_body || 'Efectivo',
        monto: monto_body,
        fecha,
        fecha_operacion: null,
        hora_operacion: null,
        nro_operacion: null,
        obs_operacion: observaciones || null,
      });
    }

    // Validar pagos (cuando existan)
    for (let i = 0; i < pagos.length; i++) {
      const p = pagos[i];
      const fpNorm = String(p.forma_pago || '').trim().toLowerCase() || 'efectivo';

      if (fpNorm === 'efectivo') continue;

      if (!p.fecha_operacion) {
        conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese la fecha de operación del pago ${i + 1}`
        });
      }

      const requiereHora   = !['yape', 'transferencia', 'interbancario'].includes(fpNorm);
      const requiereNumero = !['plin'].includes(fpNorm);

      if (requiereHora && !p.hora_operacion) {
        conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese la hora de operación del pago ${i + 1}`
        });
      }

      if (requiereNumero && !String(p.nro_operacion || '').trim()) {
        conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese el número de operación del pago ${i + 1}`
        });
      }
    }

    // Validaciones específicas por modalidad
    if (is40) {
      if (!benefactor || !benefactor.nombres?.trim()) {
        conn.release();
        return res.status(400).json({ success: false, error: 'Ingrese datos del benefactor' });
      }
      if (!Array.isArray(codigos) || codigos.filter(Boolean).length === 0) {
        conn.release();
        return res.status(400).json({ success: false, error: 'Agregue al menos un código de caja' });
      }
      if (!fecha_devolucion) {
        conn.release();
        return res.status(400).json({ success: false, error: 'Ingrese la fecha de devolución' });
      }
    }

    // Estado por defecto según modalidad
    const estadoBody  = body.estado && String(body.estado).trim();
    const estadoFinal = estadoBody || (is40 ? 'Entregada a Benefactor' : 'Asignada');

    // ===== Resolver benefactorId (ANTES de usarlo en ventas / ventas_cajas / excedentes) =====
    benefactorId = (benefactor && typeof benefactor === 'object')
      ? (benefactor.id ?? null)
      : null;

    if (is40) {
      const nombreCompuesto = [
        benefactor?.nombres?.trim(),
        benefactor?.apellidos?.trim()
      ].filter(Boolean).join(' ').trim() || 'SIN NOMBRE';

      const telefono  = benefactor?.telefono?.trim() || null;
      const email     = benefactor?.correo?.trim()   || null;
      const direccion = null;

      if (!benefactorId) {
        const [bf] = await conn.query(
          'SELECT id FROM benefactores WHERE nombre = ? AND IFNULL(telefono,"") = IFNULL(?, "") LIMIT 1',
          [nombreCompuesto, telefono]
        );
        if (bf.length) {
          benefactorId = bf[0].id;
          await conn.query(
            'UPDATE benefactores SET telefono=?, email=?, direccion=? WHERE id=?',
            [telefono, email, direccion, benefactorId]
          );
        } else {
          const [ins] = await conn.query(
            'INSERT INTO benefactores (nombre, telefono, email, direccion) VALUES (?,?,?,?)',
            [nombreCompuesto, telefono, email, direccion]
          );
          benefactorId = ins.insertId;
        }
      } else {
        await conn.query(
          'UPDATE benefactores SET nombre=?, telefono=?, email=?, direccion=? WHERE id=?',
          [nombreCompuesto, telefono, email, direccion, Number(benefactorId)]
        );
      }
    } else {
      // S/160 y otras modalidades: benefactor genérico
      benefactorId = await ensureGenericBenefactor(conn);
    }

    const fechaDevol = is40 ? (fecha_devolucion || null) : null;

    // Forma de pago resumen (en la cabecera de ventas)
    let formaPagoResumen = forma_pago_body || null;
    if (pagos.length > 0) {
      const distintas = [...new Set(pagos.map(p => (p.forma_pago || '').trim()).filter(Boolean))];
      if (distintas.length === 1) formaPagoResumen = distintas[0];
      else if (distintas.length > 1) formaPagoResumen = 'MULTIPLE';
    }

    const pagaConExcedente = is160 && formaPagoResumen === 'Con excedente';

    // Si la venta es con excedente, validamos saldo global antes de continuar
    if (pagaConExcedente) {
      const [rowsSaldo] = await conn.query('SELECT SUM(excedente) AS saldo FROM excedentes');
      const saldoGlobal = Number(rowsSaldo[0]?.saldo || 0);
      if (saldoGlobal < 160) {
        conn.release();
        return res.status(400).json({
          success: false,
          error: `El saldo de excedentes disponible es S/ ${saldoGlobal.toFixed(2)} y no alcanza para pagar S/ 160`
        });
      }
    }

    // Monto total de la venta
    const totalPagos = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    let montoVenta   = totalPagos > 0 ? totalPagos : monto_body;

    // Si es con excedente, forzamos montoVenta = 160 (no hay pagos en dinero)
    if (pagaConExcedente) {
      montoVenta = 160;
    }

    // Tomamos la primera operación no nula como resumen en cabecera
    const pagoResumen = pagos.find(p => p.fecha_operacion || p.hora_operacion || p.nro_operacion) || pagos[0];

    await conn.beginTransaction();

    // Unicidad de recibo
    const [dup] = await conn.query('SELECT id FROM ventas WHERE recibo = ? LIMIT 1', [recibo]);
    if (dup.length) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ success: false, error: 'Recibo ya registrado' });
    }

    // Generar correlativo de comprobante de Caja del Amor (serie T002).
    // El "recibo" lo escribe el usuario (control interno); este número es el
    // comprobante formal que sale impreso en el ticket.
    const serieVenta = 'T002';
    const correlativoVenta = await generarCorrelativoVenta(conn, serieVenta);
    const numeroComprobanteVenta = `${serieVenta}-${String(correlativoVenta).padStart(8, '0')}`;

    // Insert cabecera en ventas
    const [vIns] = await conn.query(
      `INSERT INTO ventas
        (recibo, fecha, modalidad_id, punto_venta_id, forma_pago, estado, monto, moneda,
         benefactor_id, fecha_devolucion, observaciones, fecha_operacion, hora_operacion, nro_operacion,
         serie, correlativo, numero_comprobante)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        String(recibo).trim(),
        fecha,
        Number(modalidad_id),
        Number(punto_venta_id),
        formaPagoResumen || null,
        estadoFinal,
        Number(montoVenta || 0),
        moneda || 'PEN',
        benefactorId,
        fechaDevol,
        observaciones ? String(observaciones).slice(0, 62) : null,
        pagoResumen?.fecha_operacion || null,
        pagoResumen?.hora_operacion || null,
        pagoResumen?.nro_operacion ? String(pagoResumen.nro_operacion).slice(0, 32) : null,
        serieVenta,
        correlativoVenta,
        numeroComprobanteVenta
      ]
    );
    const ventaId = vIns.insertId;

    // Pagos (si no es con excedente)
    for (const p of pagos) {
      await conn.query(
        `INSERT INTO ventas_pagos
          (venta_id, fecha, forma_pago, monto, moneda, fecha_operacion, hora_operacion, nro_operacion, obs_operacion)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          ventaId,
          p.fecha || fecha,
          p.forma_pago || formaPagoResumen || 'Efectivo',
          Number(p.monto || 0),
          moneda || 'PEN',
          p.fecha_operacion || null,
          p.hora_operacion || null,
          p.nro_operacion ? String(p.nro_operacion).slice(0, 32) : null,
          p.obs_operacion ? String(p.obs_operacion).slice(0, 100) : null
        ]
      );
    }

    // Resolver cajas por códigos
    const { resolved: cajasResueltas, missing: faltantes } = await resolveCajasByCodigos(conn, codigos);
    if (faltantes.length) {
      throw new Error(`Códigos no encontrados: ${faltantes.join(', ')}`);
    }

    const noDisponibles = cajasResueltas
      .filter(c => {
        const e = String(c.estado || '').toLowerCase();
        return e && !['disponible', 'libre', ''].includes(e);
      })
      .map(c => c.codigo || c.codigo_unico);

    if (noDisponibles.length) {
      throw new Error(`Cajas no disponibles: ${noDisponibles.join(', ')}`);
    }

    // Determinar estado a grabar en las cajas según estado de la venta
    let estadoCaja;
    if (estadoFinal === 'Entregada a Benefactor') {
      // Caja entregada al benefactor (la tiene el benefactor)
      estadoCaja = 'entregada';
    } else if (estadoFinal === 'Asignada') {
      // Caso especial modalidad 160: asignada pero aún no entregada
      estadoCaja = 'asignada';
    } else if (estadoFinal === 'Devuelta' || estadoFinal === 'Devuelta por Benefactor') {
      // El benefactor devolvió la caja llena
      estadoCaja = 'devuelta';
    } else if (estadoFinal === 'Entregada a Familia') {
      // Caja ya fue entregada a la familia beneficiaria
      estadoCaja = 'entregada_familia';
    } else {
      // Por defecto consideramos disponible / sin vender
      estadoCaja = 'disponible';
    }



    // ventas_cajas + actualizar cajas
    // El monto de CADA caja es el costo base de la modalidad (NO el monto total
    // de la venta, que podría incluir excedentes o multiples cajas).
    const costoUnitarioCaja = is40 ? 40 : (is160 ? 160 : 0);
    for (const c of cajasResueltas) {
      await conn.query(
        `INSERT INTO ventas_cajas
          (venta_id, caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto, moneda, fecha, estado_pago)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          ventaId,
          c.id,
          benefactorId,
          modalidad_id,
          punto_venta_id,
          req.user?.id || 1,
          costoUnitarioCaja,
          moneda,
          fecha,
          'PAGADO'
        ]
      );

      if (estadoCaja) {
        await conn.query(
          `UPDATE cajas
             SET benefactor_id=?, modalidad_id=?, punto_venta_id=?, estado=?
           WHERE id=?`,
          [
            benefactorId,
            modalidad_id,
            punto_venta_id,
            estadoCaja,
            c.id
          ]
        );
      }
    }

    // === Excedentes globales ===
    if (pagaConExcedente) {
      // Movimiento negativo de S/160
      await conn.query(
        `INSERT INTO excedentes (venta_id, excedente) VALUES (?, ?)`,
        [ventaId, -160]
      );
    } else if (is40 || is160) {
      // Para S/40: el costo base depende de cuántas cajas físicas se asignaron
      // Para S/160: es un paquete fijo sin cajas físicas asignadas
      const cantidadCajas = cajasResueltas?.length || 0;
      const costoBase    = is40 ? (40 * cantidadCajas) : 160;
      const excedentePos = Number(montoVenta) - costoBase;

      // SOLO graba si hay excedente positivo
      if (excedentePos > 0) {
        await conn.query(
          `INSERT INTO excedentes (venta_id, excedente) VALUES (?, ?)`,
          [ventaId, excedentePos]
        );
      }
    }

    await conn.commit();
    conn.release();
    return res.json({ success: true, data: { id: ventaId }, message: 'Venta registrada' });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    conn.release();
    console.error('POST /ventas', e);
    const msg = e.message?.includes('Duplicate entry')
      ? 'Recibo ya registrado'
      : (e.message || 'Error registrando venta');
    return res.status(400).json({ success: false, error: msg });
  }
});




// === LISTADO paginado y export ===

// Normaliza filtros desde querystring
function parseVentasQuery(q = {}) {
  const page  = Math.max(1, parseInt(q.page || '1', 10));
  const limit = Math.min(100000, Math.max(1, parseInt(q.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const search       = (q.search || '').trim();
  const forma_pago   = (q.forma_pago || '').trim();
  const modalidad_id = q.modalidad_id ? Number(q.modalidad_id) : null;
  const estado       = (q.estado || '').trim();
  const fecha_desde  = (q.fecha_desde || '').trim();
  const fecha_hasta  = (q.fecha_hasta || '').trim();

  const sort_by  = (q.sort_by || 'v.fecha').trim();
  const sort_dir = String(q.sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return { page, limit, offset, search, forma_pago, modalidad_id, estado, fecha_desde, fecha_hasta, sort_by, sort_dir };
}

// WHERE + params
function buildVentasWhere({ search, forma_pago, modalidad_id, estado, fecha_desde, fecha_hasta }) {
  const where = [];
  const params = [];

  if (search) {
    // Busca por recibo, nombre del benefactor, o código de caja / familia.
    // Usa EXISTS para el código, así un match en cualquier caja asociada
    // muestra la venta completa sin perder el GROUP_CONCAT de todos sus códigos.
    where.push(`(
      v.recibo LIKE ?
      OR b.nombre LIKE ?
      OR EXISTS (
        SELECT 1
        FROM ventas_cajas vc2
        JOIN cajas c2 ON c2.id = vc2.caja_id
        LEFT JOIN familias f2 ON f2.id = c2.familia_id
        WHERE vc2.venta_id = v.id
          AND (c2.codigo LIKE ? OR f2.codigo_unico LIKE ?)
      )
    )`);
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (forma_pago)  { where.push(`v.forma_pago = ?`);   params.push(forma_pago); }
  if (modalidad_id){ where.push(`v.modalidad_id = ?`); params.push(modalidad_id); }
  if (estado)      { where.push(`v.estado = ?`);       params.push(estado); }
  if (fecha_desde) { where.push(`v.fecha >= ?`);       params.push(fecha_desde); }
  if (fecha_hasta) { where.push(`v.fecha <= ?`);       params.push(fecha_hasta); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, params };
}

// GET /api/ventas → listado paginado
router.get('/', authenticateToken, authorizePermission('venta_cajas.leer'), async (req, res) => {
  try {
    const q = parseVentasQuery(req.query);
    const { whereSql, params } = buildVentasWhere(q);

    const sqlBase = `
    FROM ventas v
    LEFT JOIN benefactores b ON b.id = v.benefactor_id
    LEFT JOIN campania_modalidades m ON m.id = v.modalidad_id
    LEFT JOIN puntos_venta p        ON p.id = v.punto_venta_id
    LEFT JOIN ventas_cajas vc       ON vc.venta_id = v.id
    LEFT JOIN cajas c               ON c.id = vc.caja_id
    ${whereSql}
  `;
  
  const [tc] = await pool.query(`SELECT COUNT(DISTINCT v.id) AS total ${sqlBase}`, params);
  const total = tc[0]?.total || 0;
  
  const [rows] = await pool.query(
    `
    SELECT 
      v.id, v.recibo, v.fecha, v.modalidad_id, v.punto_venta_id,
      v.forma_pago, v.estado, v.monto, v.moneda,
      v.fecha_operacion, v.hora_operacion, v.nro_operacion, v.observaciones,
      v.fecha_devolucion,
  
      b.id AS benefactor_id, b.nombre AS benefactor_nombre, b.telefono AS benefactor_telefono, b.email AS benefactor_email,
  
      m.nombre AS modalidad_nombre,
      p.nombre AS punto_venta_nombre,
  
      GROUP_CONCAT(DISTINCT c.codigo ORDER BY c.codigo SEPARATOR ', ') AS codigos,
      GROUP_CONCAT(DISTINCT c.estado ORDER BY c.codigo SEPARATOR ', ') AS cajas_estado
    ${sqlBase}
    GROUP BY v.id
    ORDER BY ${q.sort_by} ${q.sort_dir}
    LIMIT ? OFFSET ?
    `,
    [...params, q.limit, q.offset]
  );
  

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: q.page,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
        hasPrev: q.page > 1,
        hasNext: q.page * q.limit < total
      }
    });
  } catch (e) {
    console.error('GET /ventas', e);
    res.status(500).json({ success: false, error: 'Error listando ventas' });
  }
});

router.get("/excedentes/saldo", authenticateToken, authorizePermission('venta_cajas.leer'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT SUM(excedente) AS saldo FROM excedentes
    `);
    res.json({ success: true, saldo: Number(rows[0].saldo || 0) });
  } catch (e) {
    res.status(500).json({ success: false, error: "Error consultando saldo" });
  }
});


// GET /api/ventas/export → mismo filtro, sin paginar
router.get('/export', authenticateToken, authorizePermission('venta_cajas.leer'), async (req, res) => {
  try {
    const q = parseVentasQuery({ ...req.query, page: 1, limit: 100000 });
    const { whereSql, params } = buildVentasWhere(q);

    const sqlBase = `
      FROM ventas v
      LEFT JOIN benefactores b           ON b.id = v.benefactor_id
      LEFT JOIN campania_modalidades m   ON m.id = v.modalidad_id
      LEFT JOIN puntos_venta p           ON p.id = v.punto_venta_id
      LEFT JOIN ventas_cajas vc          ON vc.venta_id = v.id
      LEFT JOIN cajas c                  ON c.id = vc.caja_id
      ${whereSql}
    `;

    const [rows] = await pool.query(
      `
      SELECT 
        v.id, v.recibo, v.fecha, v.modalidad_id, v.punto_venta_id,
        v.forma_pago, v.estado, v.monto, v.moneda,
        v.fecha_operacion, v.hora_operacion, v.nro_operacion, v.observaciones,
        v.fecha_devolucion,

        b.id    AS benefactor_id,
        b.nombre AS benefactor_nombre,
        b.telefono AS benefactor_telefono,
        b.email AS benefactor_email,

        m.nombre AS modalidad_nombre,
        p.nombre AS punto_venta_nombre,

        GROUP_CONCAT(DISTINCT c.codigo ORDER BY c.codigo SEPARATOR ', ') AS codigos,
        GROUP_CONCAT(DISTINCT c.estado ORDER BY c.codigo SEPARATOR ', ') AS cajas_estado
      ${sqlBase}
      GROUP BY v.id
      ORDER BY ${q.sort_by} ${q.sort_dir}
      LIMIT 100000
      `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('GET /ventas/export', e);
    res.status(500).json({ success: false, error: 'Error exportando ventas' });
  }
});


// ========= PUT /api/ventas/cajas/:cajaId/estado =========
// Actualiza el estado de una caja individual (DEBE ir antes de PUT /:id)
router.put('/cajas/:cajaId/estado', authenticateToken, authorizePermission('venta_cajas.actualizar'), async (req, res) => {
  try {
    const { cajaId } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ success: false, error: 'Estado requerido' });
    }

    // Mapear labels del frontend a valores de BD
    const labelToDb = {
      'Entregada a Benefactor': 'entregada',
      'Devuelta por Benefactor': 'devuelta',
      'Entregada a Familia': 'entregada_familia',
      'Disponible': 'disponible',
      'Asignada': 'asignada',
    };
    const estadoDb = labelToDb[estado] || estado; // si ya viene como valor DB, lo usa directo

    const estadosValidos = ['disponible', 'asignada', 'entregada', 'devuelta', 'entregada_familia'];
    if (!estadosValidos.includes(estadoDb)) {
      return res.status(400).json({ success: false, error: `Estado inválido: "${estado}"` });
    }

    const [result] = await pool.query(
      `UPDATE cajas SET estado = ? WHERE id = ?`, [estadoDb, cajaId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Caja no encontrada' });
    }

    // También actualizar estado_movimiento en ventas_cajas si existe
    const estadoMovMap = {
      entregada: 'ENTREGADA', devuelta: 'DEVUELTA', entregada_familia: 'ENTREGADA_FAMILIA',
      asignada: 'ENTREGADA', disponible: 'ENTREGADA'
    };
    await pool.query(
      `UPDATE ventas_cajas SET estado_movimiento = ? WHERE caja_id = ?`,
      [estadoMovMap[estadoDb] || 'ENTREGADA', cajaId]
    ).catch(() => {});

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (e) {
    console.error('PUT /ventas/cajas/:cajaId/estado:', e);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
});


// PUT /api/ventas/:id  → actualizar campos básicos y (opcional) estado de cajas
router.put('/:id', authenticateToken, authorizePermission('venta_cajas.actualizar'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const ventaId = Number(req.params.id);
    if (!ventaId) return res.status(400).json({ success: false, error: 'ID inválido' });

    const {
      fecha,
      modalidad_id,
      punto_venta_id,
      forma_pago,
      estado,               // 'Entregada a Benefactor' | 'Asignada' | 'Devuelta' (etc.)
      fecha_devolucion,
      observaciones,
      propagar_estado_cajas // boolean opcional
    } = req.body || {};

    await conn.beginTransaction();

    // Traer venta actual (para poder propagar a cajas si hace falta)
    const [vRows] = await conn.query('SELECT id, benefactor_id, fecha FROM ventas WHERE id=? LIMIT 1', [ventaId]);
    if (!vRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    const venta = vRows[0];

    // Actualizar cabecera
    await conn.query(`
      UPDATE ventas SET
        fecha = COALESCE(?, fecha),
        modalidad_id = COALESCE(?, modalidad_id),
        punto_venta_id = COALESCE(?, punto_venta_id),
        forma_pago = COALESCE(?, forma_pago),
        estado = COALESCE(?, estado),
        fecha_devolucion = COALESCE(?, fecha_devolucion),
        observaciones = COALESCE(?, observaciones)
      WHERE id = ?`,
      [
        fecha || null,
        modalidad_id || null,
        punto_venta_id || null,
        forma_pago || null,
        estado || null,
        fecha_devolucion || null,
        observaciones ? String(observaciones).slice(0, 62) : null,
        ventaId
      ]
    );

    if (propagar_estado_cajas && estado) {
      let estadoCaja = null;

      if (estado === 'Entregada a Benefactor') {
        // Caja la tiene el benefactor
        estadoCaja = 'entregada';
      } else if (estado === 'Asignada') {
        // Modalidad S/160, asignada pero sin caja física (si tuviera)
        estadoCaja = 'asignada';
      } else if (estado === 'Devuelta' || estado === 'Devuelta por Benefactor') {
        // Devuelta al punto de acopio por el benefactor
        estadoCaja = 'devuelta';
      } else if (estado === 'Entregada a Familia') {
        // Caja ya llegó a la familia beneficiaria
        estadoCaja = 'entregada_familia';
      }

      if (estadoCaja) {
        await conn.query(`
          UPDATE cajas c
          JOIN ventas_cajas vc ON vc.caja_id = c.id
          SET c.estado = ?
          WHERE vc.venta_id = ?`,
          [estadoCaja, ventaId]
        );
      }
    }

    

    await conn.commit();
    res.json({ success: true, message: 'Venta actualizada' });
  } catch (e) {
    await conn.rollback();
    console.error('PUT /ventas/:id', e);
    res.status(500).json({ success: false, error: 'Error actualizando venta' });
  } finally {
    conn.release();
  }
});


// ========= GET /api/ventas/:id/cajas =========
// Devuelve las cajas asociadas a una venta (vía ventas_cajas.venta_id)
router.get('/:id/cajas', authenticateToken, authorizePermission('venta_cajas.leer'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la venta exista
    const [ventas] = await pool.query(`SELECT id FROM ventas WHERE id = ?`, [id]);
    if (!ventas.length) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }

    // Buscar cajas vinculadas directamente por venta_id
    const [cajas] = await pool.query(`
      SELECT c.id, c.codigo, c.estado, c.familia_id, c.benefactor_id,
             vc.monto, vc.estado_pago, vc.estado_movimiento
      FROM ventas_cajas vc
      JOIN cajas c ON c.id = vc.caja_id
      WHERE vc.venta_id = ?
      ORDER BY c.codigo
    `, [id]);

    res.json({ success: true, data: cajas });
  } catch (e) {
    console.error('GET /ventas/:id/cajas:', e);
    res.status(500).json({ success: false, error: 'Error al obtener cajas de la venta' });
  }
});



// ========= TICKET PDF para venta de cajas (estilo similar a cobros) =========
// GET /api/ventas/:id/ticket — Ticket profesional 80mm con QR
router.get('/:id/ticket', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Datos de la venta
    const [ventas] = await pool.query(`
      SELECT v.id, v.recibo, v.fecha, v.monto, v.moneda, v.forma_pago, v.estado,
             v.observaciones, v.fecha_operacion, v.hora_operacion, v.nro_operacion,
             v.benefactor_id, v.fecha_devolucion,
             v.serie, v.correlativo, v.numero_comprobante,
             b.nombre AS benefactor_nombre, b.telefono AS benefactor_telefono,
             b.email AS benefactor_email, b.dni AS benefactor_dni,
             cm.nombre AS modalidad_nombre
      FROM ventas v
      LEFT JOIN benefactores b ON b.id = v.benefactor_id
      LEFT JOIN campania_modalidades cm ON cm.id = v.modalidad_id
      WHERE v.id = ?
    `, [id]);

    if (!ventas.length) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    const venta = ventas[0];

    // Cajas asociadas (por venta_id)
    const [cajas] = await pool.query(`
      SELECT vc.caja_id, vc.monto, c.codigo
      FROM ventas_cajas vc
      LEFT JOIN cajas c ON c.id = vc.caja_id
      WHERE vc.venta_id = ?
    `, [id]);

    // Pagos
    const [pagos] = await pool.query(`
      SELECT forma_pago, monto, moneda, nro_operacion
      FROM ventas_pagos WHERE venta_id = ?
    `, [id]);

    // Footer configurable
    const [config] = await pool.query(
      `SELECT valor FROM configuracion_sistema WHERE clave = 'ticket_footer_text'`
    ).catch(() => [[]]);
    const footerText = config[0]?.valor || '¡Gracias por su generosa donación!';

    // Generar QR
    const QRCode = require('qrcode');
    const qrData = JSON.stringify({
      recibo: venta.recibo,
      fecha: venta.fecha,
      monto: Number(venta.monto).toFixed(2),
      benefactor: venta.benefactor_nombre || '',
      cajas: cajas.map(c => c.codigo).join(', '),
    });
    const qrImageBuffer = await QRCode.toBuffer(qrData, {
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    // PDF 72mm = 204pt — área de impresión efectiva de la Epson TM-T20III
    const W = 204;
    const M = 8;
    const CW = W - M * 2;

    const doc = new PDFDocument({
      size: [W, 750],
      margins: { top: 10, bottom: 10, left: M, right: M }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ticket_venta_${venta.recibo || id}.pdf`);
    doc.pipe(res);

    // ═══════════ HEADER ═══════════
    doc.fontSize(10).font('Helvetica-Bold')
       .text('PARROQUIA N.S.', { align: 'center' });
    doc.fontSize(9).font('Helvetica-Bold')
       .text('DE LA RECONCILIACIÓN', { align: 'center' });
    doc.moveDown(0.15);
    doc.fontSize(6.5).font('Helvetica')
       .text('RUC: 20387535684', { align: 'center' });
    doc.fontSize(6)
       .text('Jr. Los Pinos 291, Urb. Camacho, La Molina', { align: 'center' });

    // Línea doble
    doc.moveDown(0.4);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.1);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    // ═══════════ TIPO DE DOCUMENTO ═══════════
    doc.fontSize(9).font('Helvetica-Bold')
       .text('COMPROBANTE - CAJA DEL AMOR', { align: 'center' });
    doc.moveDown(0.15);
    // Número de comprobante formal (T002-XXXXXXXX). Si por algún motivo
    // no existe (registros antiguos), cae al recibo manual del usuario.
    const numeroFormal = venta.numero_comprobante || `Recibo: ${venta.recibo || '—'}`;
    doc.fontSize(8).font('Helvetica-Bold')
       .text(`N° ${numeroFormal}`, { align: 'center' });
    if (venta.recibo && venta.numero_comprobante) {
      // También mostrar el recibo manual (control interno del usuario)
      doc.fontSize(6.5).font('Helvetica')
         .text(`Recibo: ${venta.recibo}`, { align: 'center' });
    }
    if (venta.modalidad_nombre) {
      doc.fontSize(7).font('Helvetica')
         .text(`Modalidad: ${venta.modalidad_nombre}`, { align: 'center' });
    }
    doc.moveDown(0.3);

    // ═══════════ FECHA ═══════════
    const fecha = new Date(venta.fecha || Date.now());
    const TZ_LIMA = 'America/Lima';
    const fechaStr = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ_LIMA });
    const horaStr = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: TZ_LIMA });

    doc.fontSize(7.5).font('Helvetica');
    const yFecha = doc.y;
    doc.text(`Fecha: ${fechaStr}`, M, yFecha);
    doc.text(`Hora: ${horaStr}`, M + CW / 2, yFecha);
    doc.moveDown(0.4);

    // ═══════════ BENEFACTOR ═══════════
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.2);

    doc.fontSize(7.5).font('Helvetica-Bold').text('BENEFACTOR:', M);
    doc.fontSize(7.5).font('Helvetica')
       .text(venta.benefactor_nombre || '—', M);
    if (venta.benefactor_dni) doc.text(`DNI: ${venta.benefactor_dni}`, M);
    if (venta.benefactor_telefono) doc.text(`Tel: ${venta.benefactor_telefono}`, M);
    doc.moveDown(0.3);

    // ═══════════ CAJAS ═══════════
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.2);

    doc.fontSize(7).font('Helvetica-Bold');
    const yTH = doc.y;
    doc.text('CAJA / CÓDIGO', M, yTH, { width: CW * 0.65 });
    doc.text('MONTO', M + CW * 0.65, yTH, { width: CW * 0.35, align: 'right' });
    doc.moveDown(0.2);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.15);

    doc.fontSize(7).font('Helvetica');
    if (cajas.length) {
      cajas.forEach(c => {
        const yR = doc.y;
        doc.text(c.codigo || `#${c.caja_id}`, M, yR, { width: CW * 0.65 });
        doc.text(`S/ ${Number(c.monto || 0).toFixed(2)}`, M + CW * 0.65, yR, { width: CW * 0.35, align: 'right' });
        doc.moveDown(0.3);
      });
    } else {
      doc.text('Venta de cajas', M);
      doc.moveDown(0.3);
    }

    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    // ═══════════ TOTAL ═══════════
    doc.fontSize(11).font('Helvetica-Bold');
    const yTotal = doc.y;
    doc.text('TOTAL:', M, yTotal);
    doc.text(`S/ ${Number(venta.monto || 0).toFixed(2)}`, M, yTotal, { width: CW, align: 'right' });
    doc.moveDown(0.4);

    // ═══════════ FORMAS DE PAGO ═══════════
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.2);

    doc.fontSize(7).font('Helvetica-Bold').text('FORMA(S) DE PAGO:', M);
    doc.moveDown(0.1);
    doc.font('Helvetica');
    if (pagos.length) {
      pagos.forEach(p => {
        let txt = `  • ${p.forma_pago}: S/ ${Number(p.monto || 0).toFixed(2)}`;
        if (p.nro_operacion) txt += ` (Op: ${p.nro_operacion})`;
        doc.fontSize(7).text(txt, M);
      });
    } else {
      let txt = `  • ${venta.forma_pago || 'Efectivo'}: S/ ${Number(venta.monto || 0).toFixed(2)}`;
      if (venta.nro_operacion) txt += ` (Op: ${venta.nro_operacion})`;
      doc.fontSize(7).text(txt, M);
    }

    // Fecha devolución
    if (venta.fecha_devolucion) {
      doc.moveDown(0.2);
      doc.fontSize(7).font('Helvetica-Bold')
         .text(`Fecha devolución: ${(() => { const s = typeof venta.fecha_devolucion === 'string' ? venta.fecha_devolucion : (venta.fecha_devolucion ? venta.fecha_devolucion.toISOString().slice(0,10) : ''); const p = s.slice(0,10).split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : s; })()}`, M);
    }

    // Observaciones
    if (venta.observaciones) {
      doc.moveDown(0.2);
      doc.fontSize(6.5).font('Helvetica-Oblique')
         .text(`Obs: ${venta.observaciones}`, M, doc.y, { width: CW });
    }

    // ═══════════ QR CODE ═══════════
    doc.moveDown(0.5);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.3);

    const qrSize = 70;
    const qrX = (W - qrSize) / 2;
    doc.image(qrImageBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
    doc.y += qrSize + 3;
    doc.fontSize(5.5).font('Helvetica')
       .text('Escanee para verificar', { align: 'center' });

    // ═══════════ FOOTER ═══════════
    doc.moveDown(0.4);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.1);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    doc.fontSize(7).font('Helvetica-Bold')
       .text(footerText, { align: 'center', width: CW });

    doc.end();

  } catch (e) {
    console.error('GET /ventas/:id/ticket:', e);
    res.status(500).json({ success: false, error: 'Error generando ticket' });
  }
});


module.exports = router;
