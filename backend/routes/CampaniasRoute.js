const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// Helper: normaliza '' / undefined → null (MySQL rechaza '' en columnas DATE)
const nullIfEmpty = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : v;

// Obtener campañas
router.get('/', auth, authorizePermission('campanias', 'leer'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM campanias ORDER BY anio DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener campañas' });
  }
});

// Crear campaña
// Regla: solo UNA campaña ACTIVA por año. Se permiten múltiples campañas del mismo año
// siempre que solo haya una ACTIVA. Al crear una ACTIVA, las otras del mismo año
// se desactivan automáticamente.
router.post('/', auth, authorizePermission('campanias', 'crear'), async (req, res) => {
  try {
    const { anio, nombre, descripcion, fecha_inicio, fecha_fin, estado = 'ACTIVA' } = req.body;
    if (!anio || !nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: 'Año y nombre son obligatorios' });
    }
    const estadoFinal = estado === 'INACTIVA' ? 'INACTIVA' : 'ACTIVA';

    // Si se crea ACTIVA, desactivar otras del mismo año
    if (estadoFinal === 'ACTIVA') {
      await db.query('UPDATE campanias SET estado = "INACTIVA" WHERE anio = ? AND estado = "ACTIVA"', [anio]);
    }

    await db.query(
      'INSERT INTO campanias (anio, nombre, descripcion, fecha_inicio, fecha_fin, estado) VALUES (?,?,?,?,?,?)',
      [anio, nombre, nullIfEmpty(descripcion), nullIfEmpty(fecha_inicio), nullIfEmpty(fecha_fin), estadoFinal]
    );
    res.json({ message: 'Campaña creada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear campaña' });
  }
});

// Actualizar campaña
router.put('/:id', auth, authorizePermission('campanias', 'actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado, fecha_inicio, fecha_fin } = req.body;

    // Obtener año de la campaña para aplicar regla de una ACTIVA por año
    const [rows] = await db.query('SELECT anio FROM campanias WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Campaña no encontrada' });
    const { anio } = rows[0];

    // Si se pone ACTIVA, desactivar otras del mismo año
    if (estado === 'ACTIVA') {
      await db.query('UPDATE campanias SET estado = "INACTIVA" WHERE anio = ? AND estado = "ACTIVA" AND id != ?', [anio, id]);
    }

    await db.query('UPDATE campanias SET nombre=?, descripcion=?, estado=?, fecha_inicio=?, fecha_fin=? WHERE id=?',
      [nombre, nullIfEmpty(descripcion), estado, nullIfEmpty(fecha_inicio), nullIfEmpty(fecha_fin), id]);
    res.json({ message: 'Campaña actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar campaña' });
  }
});

// Toggle estado — al activar una, desactiva otras del mismo año
router.patch('/:id/toggle', auth, authorizePermission('campanias', 'actualizar'), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query('SELECT anio, estado FROM campanias WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Campaña no encontrada' });
    const { anio, estado } = rows[0];

    if (estado === 'ACTIVA') {
      // Desactivar esta
      await db.query('UPDATE campanias SET estado = "INACTIVA" WHERE id = ?', [id]);
    } else {
      // Activar esta y desactivar las demás ACTIVAS del mismo año
      await db.query('UPDATE campanias SET estado = "INACTIVA" WHERE anio = ? AND estado = "ACTIVA"', [anio]);
      await db.query('UPDATE campanias SET estado = "ACTIVA" WHERE id = ?', [id]);
    }

    res.json({ message: 'Estado actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
});

// Eliminar campaña
router.delete('/:id', auth, authorizePermission('campanias', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM campanias WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Campaña no encontrada' });
    res.json({ message: 'Campaña eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar campaña' });
  }
});

module.exports = router;