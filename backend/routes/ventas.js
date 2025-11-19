// /backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

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
router.get('/box/:codigo', authenticateToken, async (req, res) => {
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


// POST /api/ventas → registra venta y actualiza cajas
router.post('/', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const body = req.body || {};

    const recibo           = body.recibo?.trim();
    const fecha            = body.fecha;
    const modalidad_id     = body.modalida_id || body.modalidad_id || null;
    const punto_venta_id   = body.punto_venta_id || null;
    const forma_pago_body  = body.forma_pago || null;      // forma de pago "principal" (para resumen)
    const monto_body       = Number(body.monto || 0);      // monto "de referencia"
    const moneda           = body.moneda || 'PEN';
    const benefactor       = body.benefactor || null;      // { id?, nombres, apellidos, telefono, correo }
    const codigos          = Array.isArray(body.codigos) ? body.codigos : [];

    // campos de operación "antiguos" (para compatibilidad y fallback)
    const fecha_operacion_body = body.op_fecha   || body.fecha_operacion || null;
    const hora_operacion_body  = body.op_hora    || body.hora_operacion  || null;
    const nro_operacion_body   = body.op_numero  || body.nro_operacion   || null;
    const observaciones        = body.obs        || body.observaciones   || null;
    const fecha_devolucion     = body.fecha_devolucion || null;

    // NUEVO: pagos (si viene array, lo usamos; si no, generamos 1 pago desde los campos antiguos)
    let pagos = Array.isArray(body.pagos) ? body.pagos : [];

    // Normalizamos y filtramos pagos con monto > 0
    pagos = pagos.map((p) => ({
      forma_pago: p.forma_pago || forma_pago_body || 'Efectivo',
      monto: Number(p.monto || 0),
      fecha: p.fecha || fecha,
      fecha_operacion: p.fecha_operacion || p.op_fecha || null,
      hora_operacion:  p.hora_operacion  || p.op_hora  || null,
      nro_operacion:   p.nro_operacion   || p.op_numero || null,
      obs_operacion:   p.obs_operacion   || p.op_obs   || null,
    })).filter((p) => p.monto > 0);

    // Si no vino array de pagos, generamos uno a partir del payload antiguo (compatibilidad)
    if (pagos.length === 0 && monto_body > 0) {
      pagos.push({
        forma_pago: forma_pago_body || 'Efectivo',
        monto: monto_body,
        fecha,
        fecha_operacion: fecha_operacion_body || null,
        hora_operacion:  hora_operacion_body || null,
        nro_operacion:   nro_operacion_body || null,
        obs_operacion:   observaciones || null,
      });
    }

    const is40  = Number(modalidad_id) === 1;
    const is160 = Number(modalidad_id) === 2;

    // Requeridos siempre (datos base de la venta)
    if (!recibo?.trim() || !fecha || !Number(modalidad_id) || !Number(punto_venta_id)) {
      await conn.release();
      return res.status(400).json({
        success: false,
        error: 'recibo, fecha, modalidad_id y punto_venta_id son obligatorios'
      });
    }

    // Debe existir al menos un pago con monto > 0
    if (pagos.length === 0) {
      await conn.release();
      return res.status(400).json({
        success: false,
        error: 'Ingrese al menos un pago con monto mayor a 0'
      });
    }

    // VALIDACIONES FORMA DE PAGO POR CADA PAGO (Yape/Plin/Transferencia/Interbancario)
    for (let i = 0; i < pagos.length; i++) {
      const p = pagos[i];
      const fpNorm = String(p.forma_pago || '').trim().toLowerCase() || 'efectivo';

      // Efectivo: sin obligación de fecha/hora/número
      if (fpNorm === 'efectivo') continue;

      // Siempre obligatoria la fecha de operación para pagos no efectivos
      if (!p.fecha_operacion) {
        await conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese la fecha de operación del pago ${i + 1}`
        });
      }

      // Hora NO obligatoria para: Yape, Transferencia, Interbancario
      const requiereHora = !['yape', 'transferencia', 'interbancario'].includes(fpNorm);
      // N° de operación NO obligatorio para: Plin
      const requiereNumero = !['plin'].includes(fpNorm);

      if (requiereHora && !p.hora_operacion) {
        await conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese la hora de operación del pago ${i + 1}`
        });
      }

      if (requiereNumero && !String(p.nro_operacion || '').trim()) {
        await conn.release();
        return res.status(400).json({
          success: false,
          error: `Ingrese el número de operación del pago ${i + 1}`
        });
      }
    }

    // Si es S/40, exige benefactor + al menos una caja + fecha_devolucion
    if (is40) {
      if (!benefactor || !benefactor.nombres?.trim()) {
        await conn.release();
        return res.status(400).json({ success: false, error: 'Ingrese datos del benefactor' });
      }
      if (!Array.isArray(codigos) || codigos.filter(Boolean).length === 0) {
        await conn.release();
        return res.status(400).json({ success: false, error: 'Agregue al menos un código de caja' });
      }
      if (!fecha_devolucion) {
        await conn.release();
        return res.status(400).json({ success: false, error: 'Ingrese la fecha de devolución' });
      }
    }

    // Estado por defecto según modalidad
    const estadoBody  = body.estado && String(body.estado).trim();
    const estadoFinal = estadoBody || (is40 ? 'Entregada a Benefactor' : 'Asignada');

    // Monto total de la venta = suma de pagos (si hay), si no, el monto_body
    const totalPagos = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    const montoVenta = totalPagos > 0 ? totalPagos : monto_body;

    // Forma de pago resumen:
    let formaPagoResumen = forma_pago_body || null;
    if (pagos.length > 0) {
      const distintas = [...new Set(pagos.map(p => (p.forma_pago || '').trim()).filter(Boolean))];
      if (distintas.length === 1) formaPagoResumen = distintas[0];
      else if (distintas.length > 1) formaPagoResumen = 'MULTIPLE';
    }

    // Tomamos la primera operación no nula como resumen en cabecera
    const pagoResumen = pagos.find(p => p.fecha_operacion || p.hora_operacion || p.nro_operacion) || pagos[0];

    await conn.beginTransaction();

    // Unicidad de recibo
    const [dup] = await conn.query('SELECT id FROM ventas WHERE recibo = ? LIMIT 1', [recibo]);
    if (dup.length) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({ success: false, error: 'Recibo ya registrado' });
    }

    // ===== Resolver benefactorId =====
    let benefactorId = (benefactor && typeof benefactor === 'object') ? (benefactor.id ?? null) : null;

    if (is40) {
      // S/40: upsert real con datos del benefactor
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
    } else if (is160) {
      // S/160: NO hay benefactor del cliente → usar benefactor genérico obligatorio
      benefactorId = await ensureGenericBenefactor(conn);
    } else {
      // Otras modalidades (si se agregan en el futuro): por ahora, también benefactor genérico
      benefactorId = await ensureGenericBenefactor(conn);
    }

    // Para S/160 no se guarda fecha_devolucion
    const fechaDevol = is40 ? (fecha_devolucion || null) : null;

    // Cabecera ventas
    const [vIns] = await conn.query(
      `INSERT INTO ventas 
        (recibo, fecha, modalidad_id, punto_venta_id, forma_pago, estado, monto, moneda,
          benefactor_id, fecha_devolucion, observaciones, fecha_operacion, hora_operacion, nro_operacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        pagoResumen?.nro_operacion ? String(pagoResumen.nro_operacion).slice(0, 32) : null
      ]
    );
    const ventaId = vIns.insertId;

    // Inserta pagos individuales en ventas_pagos
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

    // Resolver cajas y validar disponibilidad (solo si hay códigos)
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

    // Detalle ventas_cajas + actualizar cajas (solo si hay cajas)
    const estadoCaja =
      (estadoFinal === 'Entregada a Benefactor') ? 'entregada' :
      (estadoFinal === 'Asignada')               ? 'asignada'  :
      (estadoFinal === 'Devuelta')               ? 'devuelta'  : null;

    for (const c of cajasResueltas) {
      await conn.query(
        `INSERT INTO ventas_cajas
          (caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto, moneda, fecha, estado_pago)
          VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          c.id,
          benefactorId,
          modalidad_id,
          punto_venta_id,
          req.user?.id || 1,
          montoVenta,           // por ahora registramos el total; luego afinamos si quieres prorratear
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

    await conn.commit();
    await conn.release();
    res.json({ success: true, data: { id: ventaId }, message: 'Venta registrada' });
  } catch (e) {
    await conn.rollback();
    await conn.release();
    console.error('POST /ventas', e);
    const msg = e.message?.includes('Duplicate entry')
      ? 'Recibo ya registrado'
      : (e.message || 'Error registrando venta');
    res.status(400).json({ success: false, error: msg });
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
    where.push(`(
      v.recibo LIKE ?
      OR b.nombre LIKE ?
      OR v.moneda LIKE ?
    )`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
router.get('/', authenticateToken, async (req, res) => {
  try {
    const q = parseVentasQuery(req.query);
    const { whereSql, params } = buildVentasWhere(q);

    const sqlBase = `
    FROM ventas v
    LEFT JOIN benefactores b ON b.id = v.benefactor_id
    LEFT JOIN campania_modalidades m ON m.id = v.modalidad_id
    LEFT JOIN puntos_venta p        ON p.id = v.punto_venta_id
    LEFT JOIN ventas_cajas vc       ON vc.fecha = v.fecha AND vc.benefactor_id = v.benefactor_id
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
  
      GROUP_CONCAT(DISTINCT c.codigo ORDER BY c.codigo SEPARATOR ', ') AS codigos
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

// GET /api/ventas/export → mismo filtro, sin paginar
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const q = parseVentasQuery({ ...req.query, page: 1, limit: 100000 });
    const { whereSql, params } = buildVentasWhere(q);

    const sqlBase = `
      FROM ventas v
      LEFT JOIN benefactores b           ON b.id = v.benefactor_id
      LEFT JOIN campania_modalidades m   ON m.id = v.modalidad_id
      LEFT JOIN puntos_venta p           ON p.id = v.punto_venta_id
      LEFT JOIN ventas_cajas vc          ON vc.fecha = v.fecha AND vc.benefactor_id = v.benefactor_id
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

        GROUP_CONCAT(DISTINCT c.codigo ORDER BY c.codigo SEPARATOR ', ') AS codigos
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


// PUT /api/ventas/:id  → actualizar campos básicos y (opcional) estado de cajas
router.put('/:id', authenticateToken, async (req, res) => {
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

    // Propagar estado a las cajas involucradas (opcional)
    if (estado && propagar_estado_cajas) {
      const estadoCaja =
        (estado === 'Entregada a Benefactor') ? 'entregada' :
        (estado === 'Asignada')               ? 'asignada'  :
        (estado === 'Devuelta')               ? 'devuelta'  :
        null;

      if (estadoCaja) {
        await conn.query(`
          UPDATE cajas c
          JOIN ventas_cajas vc ON vc.caja_id = c.id
          JOIN ventas v ON v.benefactor_id = vc.benefactor_id AND v.fecha = vc.fecha
          SET c.estado = ?
          WHERE v.id = ?`,
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


module.exports = router;
