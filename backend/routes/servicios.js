// /Server/routes/servicios.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const { logAuditoria } = require('../middlewares/auditoria');

// GET /api/servicios?search=&tipo_servicio_id=&estado=&desde=&hasta=&page=&limit=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search = '', tipo_servicio_id = '', estado = '', desde = '', hasta = '', page = 1, limit = 10 } = req.query;

    const where = [];
    const params = [];

    if (tipo_servicio_id) { where.push('s.tipo_servicio_id = ?'); params.push(tipo_servicio_id); }
    if (estado)           { where.push('s.estado = ?');           params.push(estado); }
    if (desde)            { where.push('DATE(s.fecha_servicio) >= ?'); params.push(desde); }
    if (hasta)            { where.push('DATE(s.fecha_servicio) <= ?'); params.push(hasta); }
    if (search) {
      where.push(`(c.nombre LIKE ? OR c.dni LIKE ? OR ts.nombre LIKE ? OR s.descripcion LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total
      FROM servicios s
      JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
      JOIN clientes c ON c.id = s.cliente_id
      ${whereSql}`, params);

    const off = (parseInt(page) - 1) * parseInt(limit);
    const [rows] = await pool.query(`
      SELECT s.*, ts.nombre AS tipo_servicio_nombre, c.nombre AS cliente_nombre, c.dni AS cliente_dni
      FROM servicios s
      JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
      JOIN clientes c ON c.id = s.cliente_id
      ${whereSql}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), off]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.max(1, Math.ceil(total / parseInt(limit))),
        hasNext: off + parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (e) {
    console.error('SERVICIOS list:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/servicios/stats
router.get('/stats', authenticateToken, async (_req, res) => {
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM servicios`);
    const [porTipo] = await pool.query(`
      SELECT ts.nombre tipo, COUNT(*) cantidad, SUM(s.precio) total_precio
      FROM servicios s JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
      GROUP BY ts.nombre
    `);
    const [porEstado] = await pool.query(`
      SELECT estado, COUNT(*) cantidad, SUM(precio) total_precio
      FROM servicios GROUP BY estado
    `);
    const [[mesActual]] = await pool.query(`
      SELECT COUNT(*) servicios_mes, SUM(precio) ingresos_mes
      FROM servicios
      WHERE YEAR(fecha_servicio)=YEAR(CURDATE()) AND MONTH(fecha_servicio)=MONTH(CURDATE())
    `);
    res.json({ success: true, data: { total, porTipo, porEstado, mesActual } });
  } catch (e) {
    console.error('SERVICIOS stats:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/servicios/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`
      SELECT s.*, ts.nombre AS tipo_servicio_nombre, c.nombre AS cliente_nombre, c.dni AS cliente_dni
      FROM servicios s
      JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
      JOIN clientes c ON c.id = s.cliente_id
      WHERE s.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('SERVICIOS get:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/servicios
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio = null, descripcion = null, precio = 0, estado = 'programado', observaciones = null } = req.body;
    if (!tipo_servicio_id || !cliente_id || !fecha_servicio) {
      return res.status(400).json({ success: false, error: 'tipo_servicio_id, cliente_id y fecha_servicio son obligatorios' });
    }
    const [result] = await pool.execute(`
      INSERT INTO servicios (tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio, descripcion, precio, estado, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio, descripcion, precio, estado, observaciones]
    );
    await logAuditoria({
      usuario_id: req.user?.id, accion: 'CREATE', tabla: 'servicios', registro_id: result.insertId, datos_nuevos: req.body, req
    });
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Servicio creado' });
  } catch (e) {
    console.error('SERVICIOS create:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/servicios/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [before] = await pool.query(`SELECT * FROM servicios WHERE id = ?`, [id]);
    if (!before.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    const fields = ['tipo_servicio_id','cliente_id','fecha_servicio','hora_servicio','descripcion','precio','estado','observaciones'];
    const set = [], vals = [];
    for (const f of fields) if (req.body[f] !== undefined) { set.push(`${f}=?`); vals.push(req.body[f]); }
    if (!set.length) return res.json({ success: true, message: 'Sin cambios' });

    vals.push(id);
    await pool.execute(`UPDATE servicios SET ${set.join(', ')} WHERE id = ?`, vals);

    await logAuditoria({
      usuario_id: req.user?.id, accion: 'UPDATE', tabla: 'servicios', registro_id: id,
      datos_anteriores: before[0], datos_nuevos: req.body, req
    });
    res.json({ success: true, message: 'Actualizado' });
  } catch (e) {
    console.error('SERVICIOS update:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/servicios/:id/realizar
router.post('/:id/realizar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [before] = await pool.query(`SELECT * FROM servicios WHERE id=?`, [id]);
    if (!before.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    await pool.execute(`UPDATE servicios SET estado='realizado' WHERE id=?`, [id]);
    await logAuditoria({
      usuario_id: req.user?.id, accion: 'REALIZAR', tabla: 'servicios', registro_id: id,
      datos_anteriores: before[0], datos_nuevos: { estado: 'realizado' }, req
    });
    res.json({ success: true, message: 'Marcado como realizado' });
  } catch (e) {
    console.error('SERVICIOS realizar:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/servicios/:id/cancelar
router.post('/:id/cancelar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [before] = await pool.query(`SELECT * FROM servicios WHERE id=?`, [id]);
    if (!before.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    await pool.execute(`UPDATE servicios SET estado='cancelado' WHERE id=?`, [id]);
    await logAuditoria({
      usuario_id: req.user?.id, accion: 'CANCELAR', tabla: 'servicios', registro_id: id,
      datos_anteriores: before[0], datos_nuevos: { estado: 'cancelado' }, req
    });
    res.json({ success: true, message: 'Cancelado' });
  } catch (e) {
    console.error('SERVICIOS cancelar:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
