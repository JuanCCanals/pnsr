// backend/routes/metodos-pago.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

/**
 * GET /api/metodos-pago
 * Listar métodos de pago activos
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, nombre, descripcion, activo
      FROM metodos_pago
      WHERE activo = 1
      ORDER BY id
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error obteniendo métodos de pago:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
