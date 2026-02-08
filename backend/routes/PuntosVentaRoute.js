// backend/routes/PuntosVentaRoute.js
/**
 * FIX: authorizePermission('modulo', 'accion') → authorizePermission('modulo.accion')
 * La función solo acepta UN argumento, el segundo se ignoraba silenciosamente
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

router.get('/', auth, authorizePermission('puntos_venta.leer'), async (_, res) => {
  try {
    const [rows] = await db.query('SELECT pv.*, u.nombre as responsable FROM puntos_venta pv LEFT JOIN usuarios u ON u.id = pv.usuario_responsable_id');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error al listar puntos de venta:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

router.post('/', auth, authorizePermission('puntos_venta.crear'), async (req, res) => {
  try {
    const { nombre, tipo, direccion, usuario_responsable_id } = req.body;
    await db.query(
      'INSERT INTO puntos_venta (nombre, tipo, direccion, usuario_responsable_id) VALUES (?,?,?,?)',
      [nombre, tipo, direccion, usuario_responsable_id]
    );
    res.json({ success: true, message: 'Punto de venta creado' });
  } catch (error) {
    console.error('Error al crear punto de venta:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

router.put('/:id', auth, authorizePermission('puntos_venta.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, direccion, usuario_responsable_id, estado } = req.body;
    await db.query(
      'UPDATE puntos_venta SET nombre=?, tipo=?, direccion=?, usuario_responsable_id=?, estado=? WHERE id=?',
      [nombre, tipo, direccion, usuario_responsable_id, estado, id]
    );
    res.json({ success: true, message: 'Punto de venta actualizado' });
  } catch (error) {
    console.error('Error al actualizar punto de venta:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
