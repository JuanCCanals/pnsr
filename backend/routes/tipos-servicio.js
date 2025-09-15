const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

// Helpers de mapeo DB <-> API
const toApi = (row) => ({
  id: row.id,
  nombre: row.nombre,
  descripcion: row.descripcion,
  costo_sugerido: row.precio_base != null ? Number(row.precio_base) : null,
  estado: row.activo ? 'activo' : 'inactivo',
  created_at: row.created_at,
  updated_at: row.updated_at,
});
const estadoToActivo = (estado) => (estado === 'inactivo' ? 0 : 1);

// GET /api/tipos-servicio?search=&estado=&page=&limit=
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search = '', estado = '', page = 1, limit = 100 } = req.query;

    const where = [];
    const params = [];

    if (search) {
      where.push('(nombre LIKE ? OR descripcion LIKE ?)');
      const t = `%${search}%`;
      params.push(t, t);
    }
    if (estado) {
      where.push('activo = ?');
      params.push(estadoToActivo(estado));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 100;
    const off = (p - 1) * l;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) total FROM tipos_servicio ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT id, nombre, descripcion, precio_base, activo, created_at, updated_at
       FROM tipos_servicio
       ${whereSql}
       ORDER BY nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, l, off]
    );

    res.json({
      success: true,
      data: rows.map(toApi),
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages: Math.max(1, Math.ceil(total / l)),
        hasPrev: p > 1,
        hasNext: off + l < total
      }
    });
  } catch (e) {
    console.error('TIPOS-SERVICIO list:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/tipos-servicio/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, nombre, descripcion, precio_base, activo, created_at, updated_at
       FROM tipos_servicio WHERE id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: toApi(rows[0]) });
  } catch (e) {
    console.error('TIPOS-SERVICIO get:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/tipos-servicio
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion = null, costo_sugerido = null, estado = 'activo' } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }

    const [r] = await pool.execute(
      `INSERT INTO tipos_servicio (nombre, descripcion, precio_base, activo)
       VALUES (?, ?, ?, ?)`,
      [
        String(nombre).trim(),
        descripcion || null,
        (costo_sugerido === '' || costo_sugerido == null) ? null : Number(costo_sugerido),
        estadoToActivo(estado)
      ]
    );

    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) {
    console.error('TIPOS-SERVICIO create:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/tipos-servicio/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [before] = await pool.query(`SELECT id FROM tipos_servicio WHERE id = ?`, [id]);
    if (!before.length) return res.status(404).json({ success: false, error: 'No encontrado' });

    const set = [], vals = [];
    if (req.body.nombre !== undefined) {
      if (!String(req.body.nombre).trim()) {
        return res.status(400).json({ success: false, error: 'El nombre no puede estar vacío' });
      }
      set.push('nombre = ?'); vals.push(String(req.body.nombre).trim());
    }
    if (req.body.descripcion !== undefined) { set.push('descripcion = ?'); vals.push(req.body.descripcion || null); }
    if (req.body.costo_sugerido !== undefined) {
      set.push('precio_base = ?');
      vals.push(req.body.costo_sugerido === '' || req.body.costo_sugerido == null ? null : Number(req.body.costo_sugerido));
    }
    if (req.body.estado !== undefined) { set.push('activo = ?'); vals.push(estadoToActivo(req.body.estado)); }

    if (!set.length) return res.json({ success: true, message: 'Sin cambios' });

    vals.push(id);
    await pool.execute(`UPDATE tipos_servicio SET ${set.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true, message: 'Actualizado' });
  } catch (e) {
    console.error('TIPOS-SERVICIO update:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/tipos-servicio/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Evitar borrar si hay servicios que lo referencian (si tu tabla servicios tiene tipo_servicio_id)
    try {
      const [[{ cnt }]] = await pool.query(
        `SELECT COUNT(*) cnt FROM servicios WHERE tipo_servicio_id = ?`,
        [id]
      );
      if (cnt > 0) {
        return res.status(409).json({
          success: false,
          error: 'No se puede eliminar: hay servicios que usan este tipo'
        });
      }
    } catch (_e) { /* ignora si la tabla no existe en este esquema */ }

    const [r] = await pool.execute(`DELETE FROM tipos_servicio WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, message: 'Eliminado' });
  } catch (e) {
    console.error('TIPOS-SERVICIO delete:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
