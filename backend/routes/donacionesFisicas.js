// backend/routes/donacionesFisicas.js
/**
 * CRUD de Donaciones Físicas (bienes: ropa, alimentos, etc.)
 * Tabla: donaciones_fisicas
 * Permisos: donaciones_fisicas_leer, _crear, _actualizar, _eliminar
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// helpers
const norm = v => (v ?? '').toString().trim();
const toInt = v => Number.parseInt(v, 10);

// ========= LISTADO =========
// GET /api/donaciones-fisicas?search=&categoria=&estado=&desde=&hasta=&page=1&limit=20
router.get('/', authenticateToken, authorizePermission('donaciones_fisicas.leer'), async (req, res) => {
  try {
    const search    = norm(req.query.search);
    const categoria = norm(req.query.categoria);
    const estado    = norm(req.query.estado);
    const desde     = norm(req.query.desde);
    const hasta     = norm(req.query.hasta);
    const page      = Math.max(toInt(req.query.page || '1'), 1);
    const limit     = Math.min(Math.max(toInt(req.query.limit || '20'), 1), 200);
    const offset    = (page - 1) * limit;

    const where = [];
    const args  = [];

    if (search) {
      where.push(`(d.donante_nombre LIKE ? OR d.descripcion LIKE ? OR d.destino LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (categoria) { where.push(`d.categoria = ?`);      args.push(categoria); }
    if (estado)    { where.push(`d.estado = ?`);          args.push(estado); }
    if (desde)     { where.push(`d.fecha_donacion >= ?`); args.push(desde); }
    if (hasta)     { where.push(`d.fecha_donacion <= ?`); args.push(hasta); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM donaciones_fisicas d ${whereSQL}`, args
    );

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const [rows] = await pool.query(
      `SELECT d.*
       FROM donaciones_fisicas d
       ${whereSQL}
       ORDER BY d.fecha_donacion DESC, d.id DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages }
    });
  } catch (e) {
    console.error('DONACIONES_FISICAS list:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ========= ESTADÍSTICAS =========
router.get('/stats', authenticateToken, authorizePermission('donaciones_fisicas.leer'), async (_req, res) => {
  try {
    const [[{ total }]]       = await pool.query(`SELECT COUNT(*) AS total FROM donaciones_fisicas`);
    const [[{ recibidos }]]   = await pool.query(`SELECT COUNT(*) AS recibidos FROM donaciones_fisicas WHERE estado='recibido'`);
    const [[{ distribuidos }]]= await pool.query(`SELECT COUNT(*) AS distribuidos FROM donaciones_fisicas WHERE estado='distribuido'`);
    const [[{ en_almacen }]]  = await pool.query(`SELECT COUNT(*) AS en_almacen FROM donaciones_fisicas WHERE estado='en_almacen'`);

    res.json({ success: true, data: { total, recibidos, distribuidos, en_almacen } });
  } catch (e) {
    console.error('DONACIONES_FISICAS stats:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ========= OBTENER UNO =========
router.get('/:id', authenticateToken, authorizePermission('donaciones_fisicas.leer'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM donaciones_fisicas WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('DONACIONES_FISICAS getOne:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ========= CREAR =========
router.post('/', authenticateToken, authorizePermission('donaciones_fisicas.crear'), async (req, res) => {
  try {
    const {
      donante_nombre,
      donante_telefono = null,
      donante_dni = null,
      categoria = 'otros',
      descripcion,
      cantidad = 1,
      unidad = 'unidades',
      fecha_donacion,
      destino = null,
      observaciones = null,
      estado = 'recibido'
    } = req.body;

    const errors = [];
    if (!donante_nombre?.trim())  errors.push({ field: 'donante_nombre', message: 'Nombre del donante requerido' });
    if (!descripcion?.trim())     errors.push({ field: 'descripcion',    message: 'Descripción requerida' });
    if (!fecha_donacion)          errors.push({ field: 'fecha_donacion', message: 'Fecha de donación requerida' });

    if (errors.length) return res.status(400).json({ success: false, errors });

    const registrado_por = req.user?.id || null;

    const [r] = await pool.execute(
      `INSERT INTO donaciones_fisicas
        (donante_nombre, donante_telefono, donante_dni, categoria, descripcion,
         cantidad, unidad, fecha_donacion, destino, observaciones, estado, registrado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [donante_nombre.trim(), donante_telefono, donante_dni, categoria, descripcion.trim(),
       cantidad, unidad, fecha_donacion, destino, observaciones, estado, registrado_por]
    );

    res.status(201).json({ success: true, data: { id: r.insertId }, message: 'Donación registrada' });
  } catch (e) {
    console.error('DONACIONES_FISICAS create:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ========= ACTUALIZAR =========
router.put('/:id', authenticateToken, authorizePermission('donaciones_fisicas.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const [exist] = await pool.query(`SELECT id FROM donaciones_fisicas WHERE id = ?`, [id]);
    if (!exist.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    const fields = [
      'donante_nombre','donante_telefono','donante_dni','categoria','descripcion',
      'cantidad','unidad','fecha_donacion','destino','observaciones','estado'
    ];
    const sets = [];
    const vals = [];
    fields.forEach(k => {
      if (k in req.body) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
    });

    if (!sets.length) return res.json({ success: true, message: 'Sin cambios' });

    vals.push(id);
    await pool.execute(`UPDATE donaciones_fisicas SET ${sets.join(', ')} WHERE id = ?`, vals);

    res.json({ success: true, message: 'Donación actualizada' });
  } catch (e) {
    console.error('DONACIONES_FISICAS update:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ========= ELIMINAR =========
router.delete('/:id', authenticateToken, authorizePermission('donaciones_fisicas.eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    const [exist] = await pool.query(`SELECT id FROM donaciones_fisicas WHERE id = ?`, [id]);
    if (!exist.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    await pool.execute(`DELETE FROM donaciones_fisicas WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Donación eliminada' });
  } catch (e) {
    console.error('DONACIONES_FISICAS delete:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
