const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');

// GET /api/ventas/box/:codigo – Obtener caja por código único
router.get('/box/:codigo', auth, async (req, res) => {
  const { codigo } = req.params;
  try {
          const [rows] = await db.query(
              `SELECT
                 c.*,
                 z.nombre AS zona_nombre
               FROM cajas c
               /* Unimos con familias para obtener su zona */
               LEFT JOIN familias f ON c.familia_id = f.id
               LEFT JOIN zonas z      ON f.zona_id   = z.id
               WHERE c.codigo = ?`,
              [codigo]
            );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Caja no encontrada' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error fetching caja:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// POST /api/ventas  – Registrar venta (caja pasa a ASIGNADA)
router.post('/', auth, async (req, res) => {
  const { caja_id, benefactor_id, modalidad_id, punto_venta_id, monto } = req.body;
  const userId = req.user.id;

  try {
    // validar caja disponible
    const [cajaRows] = await db.query('SELECT estado FROM cajas WHERE id = ?', [caja_id]);
    if (!cajaRows.length) {
      return res.status(404).json({ success: false, message: 'Caja no encontrada' });
    }
    if (cajaRows[0].estado !== 'disponible') {
      return res.status(400).json({ success: false, message: 'Caja no disponible' });
    }

    // insertar venta
    await db.query(
      'INSERT INTO ventas_cajas (caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto) VALUES (?,?,?,?,?,?)',
      [caja_id, benefactor_id, modalidad_id, punto_venta_id, userId, monto]
    );

    // actualizar caja → ASIGNADA
    await db.query(
      'UPDATE cajas SET estado="asignada", benefactor_id=?, modalidad_id=?, punto_venta_id=? WHERE id=?',
      [benefactor_id, modalidad_id, punto_venta_id, caja_id]
    );

    res.json({ success: true, message: 'Venta registrada y caja asignada' });
  } catch (err) {
    console.error('Error registrando venta:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// PUT /api/ventas/:id/entregar  – Benefactor entrega caja llena → ENTREGADA
router.put('/:id/entregar', auth, async (req, res) => {
  const { id } = req.params;
  try {
    // verificar estado actual
    const [rows] = await db.query('SELECT caja_id FROM ventas_cajas WHERE id=?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }
    const caja_id = rows[0].caja_id;

    await db.query(
      'UPDATE cajas SET estado="entregada", fecha_entrega=NOW() WHERE id=?',
      [caja_id]
    );
    res.json({ success: true, message: 'Caja marcada como entregada' });
  } catch (err) {
    console.error('Error al marcar entregada:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// PUT /api/ventas/:id/devolver  – Caja devuelta a parroquia → DEVUELTA
router.put('/:id/devolver', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT caja_id FROM ventas_cajas WHERE id=?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }
    const caja_id = rows[0].caja_id;

    await db.query(
      'UPDATE cajas SET estado="devuelta", fecha_devolucion=NOW() WHERE id=?',
      [caja_id]
    );
    res.json({ success: true, message: 'Caja marcada como devuelta' });
  } catch (err) {
    console.error('Error al marcar devuelta:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;
