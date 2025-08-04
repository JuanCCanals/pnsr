// /Server/middlewares/auth.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

module.exports = async function authenticateToken (req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].activo) return res.status(401).json({ success: false, error: 'Usuario inválido' });

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(403).json({ success: false, error: 'Token inválido' });
  }
};