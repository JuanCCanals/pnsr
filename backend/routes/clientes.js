// /Server/routes/clientes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const { logAuditoria } = require('../middlewares/auditoria');

// GET /api/clientes?search=...&page=&limit=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(dni LIKE ? OR nombre LIKE ? OR telefono LIKE ? OR email LIKE ?)');
      const t = `%${search}%`;
      params.push(t, t, t, t);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM clientes ${whereSql}`, params);
    const off = (parseInt(page)-1)*parseInt(limit);
    const [rows] = await pool.query(`SELECT * FROM clientes ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), off]);
    res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total } });
  } catch (e) {
    console.error('CLIENTES list:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/clientes/by-dni/:dni
// Busqueda directa por DNI/RUC para auto-llenar el formulario cuando el
// feligres ya fue registrado antes (evita salir a APIs externas si ya
// tenemos sus datos).
router.get('/by-dni/:dni', authenticateToken, async (req, res) => {
  try {
    const dni = String(req.params.dni || '').trim();
    if (!/^\d{8}$|^\d{11}$/.test(dni)) {
      return res.status(400).json({ success: false, error: 'DNI debe tener 8 o 11 digitos' });
    }
    const [rows] = await pool.query(
      'SELECT id, dni, nombre, telefono, email, direccion FROM clientes WHERE dni = ? LIMIT 1',
      [dni]
    );
    if (!rows.length) {
      return res.json({ success: true, found: false });
    }
    res.json({ success: true, found: true, data: rows[0] });
  } catch (e) {
    console.error('CLIENTES by-dni:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/clientes
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { dni = null, nombre, telefono = null, email = null, direccion = null, activo = 1 } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'nombre es obligatorio' });
    const [r] = await pool.execute(
      `INSERT INTO clientes (dni, nombre, telefono, email, direccion, activo) VALUES (?, ?, ?, ?, ?, ?)`,
      [dni, nombre, telefono, email, direccion, activo]
    );
    await logAuditoria({ usuario_id: req.user?.id, accion: 'CREATE', tabla: 'clientes', registro_id: r.insertId, datos_nuevos: req.body, req });
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) {
    console.error('CLIENTES create:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [b] = await pool.query(`SELECT * FROM clientes WHERE id=?`, [id]);
    if (!b.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    const fields = ['dni','nombre','telefono','email','direccion','activo'];
    const set = [], vals = [];
    for (const f of fields) if (req.body[f] !== undefined) { set.push(`${f}=?`); vals.push(req.body[f]); }
    if (!set.length) return res.json({ success: true, message: 'Sin cambios' });
    vals.push(id);
    await pool.execute(`UPDATE clientes SET ${set.join(', ')} WHERE id=?`, vals);
    await logAuditoria({ usuario_id: req.user?.id, accion: 'UPDATE', tabla: 'clientes', registro_id: id, datos_anteriores: b[0], datos_nuevos: req.body, req });
    res.json({ success: true, message: 'Actualizado' });
  } catch (e) {
    console.error('CLIENTES update:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
