// backend/routes/configuracion.js
// FIX: authorizePermission('modulo', 'accion') → authorizePermission('modulo.accion')
//      La función solo acepta UN argumento, el segundo se ignoraba silenciosamente
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// GET /api/configuracion/:clave
router.get('/:clave', authenticateToken, authorizePermission('configuracion.leer'), async (req, res) => {
  try {
    const { clave } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM configuracion_sistema WHERE clave = ?',
      [clave]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Configuración no encontrada' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/configuracion/:clave
router.put('/:clave', authenticateToken, authorizePermission('configuracion.actualizar'), async (req, res) => {
  try {
    const { clave } = req.params;
    const { valor } = req.body;
    
    await pool.query(
      'UPDATE configuracion_sistema SET valor = ? WHERE clave = ?',
      [valor, clave]
    );
    
    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
