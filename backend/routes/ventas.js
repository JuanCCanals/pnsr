// backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

// Helper: busca caja por cajas.codigo O familias.codigo_unico
// Acepta una conexión de transacción (conn) o usa pool si no se pasa.
async function getCajaByCodigo(connOrCodigo, maybeCodigo) {
  let conn = pool;
  let codigo = maybeCodigo;

  // Permite llamada como getCajaByCodigo(conn, codigo) o getCajaByCodigo(codigo)
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

// GET /api/ventas/box/:codigo  → validar código antes de agregar a la tabla del popup
router.get('/box/:codigo', authenticateToken, async (req, res) => {
  try {
    const codigo = decodeURIComponent(req.params.codigo || '').trim();
    if (!codigo) return res.status(400).json({ success: false, error: 'Código requerido' });

    const caja = await getCajaByCodigo(codigo);
    if (!caja) return res.json({ success: false, error: 'No existe la caja' });

    // Si manejas estado en 'cajas', valida disponibilidad:
    if (caja.caja_estado && !['disponible', 'libre', null, ''].includes(String(caja.caja_estado).toLowerCase())) {
      return res.json({ success: false, error: `Caja en estado: ${caja.caja_estado}` });
    }

    res.json({ success: true, data: caja });
  } catch (e) {
    console.error('GET /ventas/box/:codigo', e);
    res.status(500).json({ success: false, error: 'Error buscando caja' });
  }
});

// POST /api/ventas  → cabecera (ventas) + detalle (ventas_detalle) + marcar cajas
router.post('/', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      recibo, fecha, modalidad_id, punto_venta_id,
      forma_pago, estado = 'Entregada a Benefactor',
      monto, moneda = 'PEN',
      benefactor,  // { id?, nombres, apellidos, telefono, correo }
      codigos      // array de alfanuméricos (caja.codigo o familia.codigo_unico)
    } = req.body || {};

    if (!recibo?.trim() || !fecha || !benefactor || !Array.isArray(codigos) || codigos.length === 0) {
      return res.status(400).json({ success: false, error: 'Recibo, fecha, benefactor y al menos 1 código son requeridos' });
    }

    // monto vendrá de la modalidad seleccionada; si no llega, default 0
    const montoTotal = Number(monto || 0);

    await conn.beginTransaction();

    // Recibo único
    const [dup] = await conn.query('SELECT id FROM ventas WHERE recibo = ? LIMIT 1', [recibo.trim()]);
    if (dup.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Recibo ya registrado' });
    }

    // Upsert benefactor (usando tu esquema actual de “nombres/apellidos/telefono/correo”)
    let benefactorId = benefactor.id || null;
    if (!benefactorId) {
      const [ins] = await conn.query(
        `INSERT INTO benefactores (nombres, apellidos, telefono, correo, activo)
          VALUES (?,?,?,?,1)`,
        [
          benefactor.nombres?.trim() || 'SIN NOMBRE',
          benefactor.apellidos?.trim() || null,
          benefactor.telefono?.trim()  || null,
          benefactor.correo?.trim()    || null
        ]
      );
      benefactorId = ins.insertId;
    } else {
      await conn.query(
        `UPDATE benefactores SET nombres=?, apellidos=?, telefono=?, correo=? WHERE id=?`,
        [
          benefactor.nombres?.trim() || 'SIN NOMBRE',
          benefactor.apellidos?.trim() || null,
          benefactor.telefono?.trim()  || null,
          benefactor.correo?.trim()    || null,
          Number(benefactorId)
        ]
      );
    }

    // Cabecera: ventas
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

    // Detalle: por cada código, validar y registrar
    for (const raw of codigos) {
      const codigo = String(raw || '').trim();
      if (!codigo) continue;

      const caja = await getCajaByCodigo(conn, codigo);
      if (!caja) throw new Error(`Caja ${codigo} no existe`);

      if (caja.caja_estado && !['disponible', 'libre', null, ''].includes(String(caja.caja_estado).toLowerCase())) {
        throw new Error(`Caja ${codigo} en estado ${caja.caja_estado}`);
      }

      // ventas_detalle (si usas ventas_cajas, cambia el nombre de la tabla y columnas aquí)
      await conn.query(
        `INSERT INTO ventas_detalle (venta_id, caja_id, codigo, familia_id, zona_id, punto_venta_id, modalidad_id, monto, moneda, fecha)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          ventaId,
          caja.caja_id,
          caja.caja_codigo || caja.familia_codigo,
          caja.familia_id || null,
          caja.zona_id || null,
          punto_venta_id || null,
          modalidad_id || null,
          montoTotal, // si deseas monto unitario por caja, cámbialo según tu regla
          moneda,
          fecha
        ]
      );

      // marcar la caja
      await conn.query(
        `UPDATE cajas SET estado='asignada', benefactor_id=? WHERE id=?`,
        [benefactorId, caja.caja_id]
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
