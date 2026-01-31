const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');

// Obtener campañas
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM campanias ORDER BY anio DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener campañas' });
  }
});

// Crear campaña
router.post('/', auth, async (req, res) => {
  try {
    const { anio, nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
    await db.query('INSERT INTO campanias (anio, nombre, descripcion, fecha_inicio, fecha_fin) VALUES (?,?,?,?,?)',
      [anio, nombre, descripcion, fecha_inicio, fecha_fin]);
    res.json({ message: 'Campaña creada' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Año ya existe' });
    console.error(err);
    res.status(500).json({ message: 'Error al crear campaña' });
  }
});

// Actualizar campaña
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado, fecha_inicio, fecha_fin } = req.body;
    await db.query('UPDATE campanias SET nombre=?, descripcion=?, estado=?, fecha_inicio=?, fecha_fin=? WHERE id=?',
      [nombre, descripcion, estado, fecha_inicio, fecha_fin, id]);
    res.json({ message: 'Campaña actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar campaña' });
  }
});

// Toggle estado
router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      'UPDATE campanias SET estado = IF(estado = "ACTIVA", "INACTIVA", "ACTIVA") WHERE id = ?',
      [id]
    );
    res.json({ message: 'Estado actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
});

module.exports = router;