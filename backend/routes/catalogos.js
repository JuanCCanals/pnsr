const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

router.get('/modalidades', authenticateToken, async (_req, res) => {
    try {
        const [rows] = await pool.query(
        `SELECT id, nombre, costo 
            FROM campania_modalidades 
            WHERE activo = 1 
            ORDER BY orden IS NULL, orden, id`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('GET /catalogos/modalidades', e);
        res.status(500).json({ success: false, error: 'Error cargando modalidades' });
    }
});

router.get('/puntos-venta', authenticateToken, async (_req, res) => {
    try {
        const [rows] = await pool.query(
        `SELECT id, nombre 
            FROM puntos_venta 
            WHERE activo = 1 
            ORDER BY nombre`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('GET /catalogos/puntos-venta', e);
        res.status(500).json({ success: false, error: 'Error cargando puntos de venta' });
    }
});

module.exports = router;
