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

// 🔎 Nueva utilidad: resolver una lista de códigos contra cajas.codigo O familias.codigo_unico
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

  // Mapeo por ambos identificadores para respetar el orden original de "codigos"
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

// POST /api/ventas  → cabecera (ventas) + detalle (ventas_cajas) + actualizar cajas
router.post('/', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      recibo, fecha, modalidad_id, punto_venta_id,
      forma_pago, estado = 'Entregada a Benefactor',
      monto, moneda = 'PEN',
      benefactor,  // { id?, nombres, apellidos, telefono, correo }
      codigos      // array de códigos (pueden ser cajas.codigo o familias.codigo_unico)
    } = req.body || {};

    if (!recibo?.trim() || !fecha || !benefactor || !Array.isArray(codigos) || codigos.length === 0) {
      return res.status(400).json({ success: false, error: 'Recibo, fecha, benefactor y al menos 1 código son requeridos' });
    }

    const montoTotal = Number(monto || 0);

    await conn.beginTransaction();

    // Unicidad de recibo
    const [dup] = await conn.query('SELECT id FROM ventas WHERE recibo = ? LIMIT 1', [recibo.trim()]);
    if (dup.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Recibo ya registrado' });
    }

    // Upsert benefactor → usar COLUMNA nombre (no "nombres")
    let benefactorId = benefactor.id || null;
    const nombreCompuesto = [benefactor.nombres?.trim(), benefactor.apellidos?.trim()]
      .filter(Boolean).join(' ').trim() || 'SIN NOMBRE';
    const telefono  = benefactor.telefono?.trim() || null;
    const email     = benefactor.correo?.trim()   || null;
    const direccion = null; // si luego lo capturas

    if (!benefactorId) {
      // Buscar si existe por (nombre + telefono)
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

    // Cabecera de venta
    const [vIns] = await conn.query(
      `INSERT INTO ventas 
        (recibo, fecha, modalidad_id, punto_venta_id, forma_pago, estado, monto, moneda, benefactor_id)
        VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        recibo.trim(),
        fecha,
        modalidad_id || null,
        punto_venta_id || null,
        forma_pago || null,
        estado,
        montoTotal,
        moneda,
        benefactorId
      ]
    );
    const ventaId = vIns.insertId;

    // ✅ Validar/Resolver todas las cajas a partir de codigos[] (caja.codigo o familia.codigo_unico)
    const { resolved: cajasResueltas, missing: faltantes } = await resolveCajasByCodigos(conn, codigos);
    if (faltantes.length) throw new Error(`Códigos no encontrados: ${faltantes.join(', ')}`);

    // Disponibilidad: permitimos 'disponible' o 'libre' o vacío
    const noDisponibles = cajasResueltas
      .filter(c => {
        const e = String(c.estado || '').toLowerCase();
        return e && !['disponible', 'libre', ''].includes(e);
      })
      .map(c => c.codigo || c.codigo_unico);

    if (noDisponibles.length) throw new Error(`Cajas no disponibles: ${noDisponibles.join(', ')}`);

    // Detalle en ventas_cajas + actualizar cajas (una fila por caja resuelta)
    for (const c of cajasResueltas) {
      await conn.query(
        `INSERT INTO ventas_cajas
          (caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto, moneda, fecha, estado_pago)
          VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          c.id,
          benefactorId,
          modalidad_id || null,
          punto_venta_id || null,
          req.user?.id || 1,
          montoTotal, // Si luego usas precio unitario por modalidad, ajusta aquí
          moneda,
          fecha,
          'PAGADO'
        ]
      );

      await conn.query(
        `UPDATE cajas
          SET benefactor_id=?, modalidad_id=?, punto_venta_id=?, estado=?
          WHERE id=?`,
        [
          benefactorId,
          modalidad_id || null,
          punto_venta_id || null,
          (estado === 'Entregada a Benefactor') ? 'entregada' :
          (estado === 'Asignada' ? 'asignada' : 'devuelta'),
          c.id
        ]
      );
    }

    await conn.commit();
    res.json({ success: true, data: { id: ventaId }, message: 'Venta registrada' });
  } catch (e) {
    await conn.rollback();
    console.error('POST /ventas', e);
    const msg = e.message?.includes('Duplicate entry') ? 'Recibo ya registrado' : (e.message || 'Error registrando venta');
    res.status(500).json({ success: false, error: msg });
  } finally {
    conn.release();
  }
});

module.exports = router;
