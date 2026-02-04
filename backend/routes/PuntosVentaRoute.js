const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

router.get('/', auth, authorizePermission('puntos_venta', 'leer'), async (_, res) => {
  const [rows] = await db.query('SELECT pv.*, u.nombre as responsable FROM puntos_venta pv LEFT JOIN usuarios u ON u.id = pv.usuario_responsable_id');
  res.json(rows);
});

router.post('/', auth, authorizePermission('puntos_venta', 'crear'), async (req, res) => {
  const { nombre, tipo, direccion, usuario_responsable_id } = req.body;
  await db.query(
    'INSERT INTO puntos_venta (nombre, tipo, direccion, usuario_responsable_id) VALUES (?,?,?,?)',
    [nombre, tipo, direccion, usuario_responsable_id]
  );
  res.json({ message: 'Punto de venta creado' });
});

router.put('/:id', auth, authorizePermission('puntos_venta', 'actualizar'), async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo, direccion, usuario_responsable_id, estado } = req.body;
  await db.query(
    'UPDATE puntos_venta SET nombre=?, tipo=?, direccion=?, usuario_responsable_id=?, estado=? WHERE id=?',
    [nombre, tipo, direccion, usuario_responsable_id, estado, id]
  );
  res.json({ message: 'Punto de venta actualizado' });
});

module.exports = router;