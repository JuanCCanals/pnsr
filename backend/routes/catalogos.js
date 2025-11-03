// /backend/routes/catalogos.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

// Modalidades para el select
router.get('/modalidades', authenticateToken, async (req, res) => {
  try {
    // En tu esquema, la columna útil es "estado" (no "activo")
    const [rows] = await pool.query(
      'SELECT id, nombre, costo FROM campania_modalidades WHERE estado = 1 ORDER BY id ASC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /catalogos/modalidades', err);
    res.status(500).json({ success: false, error: 'No se pudieron obtener modalidades' });
  }
});

// Puntos de venta para el select
router.get('/puntos-venta', authenticateToken, async (req, res) => {
  try {
    // Cambiado "activo" -> "estado"
    const [rows] = await pool.query(
      'SELECT id, nombre FROM puntos_venta WHERE estado = 1 ORDER BY nombre'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /catalogos/puntos-venta', err);
    res.status(500).json({ success: false, error: 'No se pudieron obtener puntos de venta' });
  }
});

module.exports = router;
