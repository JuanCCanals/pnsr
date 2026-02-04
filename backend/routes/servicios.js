// /Server/routes/servicios.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// Módulo: servicios (modulo_id = 10 en BD)

// helpers
const norm = v => (v ?? '').toString().trim();
const toInt = v => Number.parseInt(v, 10);

// ========= CONFIG =========
// GET /api/servicios/config/tipos  -> lee de tipos_servicio
router.get('/config/tipos', authenticateToken, authorizePermission('servicios', 'leer'), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id AS value, nombre AS label, precio_base
        FROM tipos_servicio
        WHERE activo = 1
        ORDER BY nombre`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('SERVICIOS config/tipos:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// GET /api/servicios/config/formas-pago
router.get('/config/formas-pago', authenticateToken, authorizePermission('servicios', 'leer'), async (_req, res) => {
  // Igual que Gestión
  const data = [
    { value:'efectivo',      label:'Efectivo' },
    { value:'yape',          label:'Yape' },
    { value:'plin',          label:'Plin' },
    { value:'transferencia', label:'Transferencia' },
    { value:'interbancario', label:'Interbancario' },
  ];
  res.json({ success:true, data });
});

// ========= LISTADO & STATS =========
// GET /api/servicios?search=&tipo_servicio_id=&cliente_id=&estado=&desde=&hasta=&page=1&limit=20
router.get('/', authenticateToken, authorizePermission('servicios', 'leer'), async (req, res) => {
  try {
    const search = norm(req.query.search);
    const tipoId = norm(req.query.tipo_servicio_id);
    const clienteId = norm(req.query.cliente_id);
    const estado = norm(req.query.estado);
    const desde = norm(req.query.desde);
    const hasta = norm(req.query.hasta);
    const page  = Math.max(toInt(req.query.page || '1'), 1);
    const limit = Math.min(Math.max(toInt(req.query.limit || '20'), 1), 200);
    const offset = (page - 1) * limit;

    const where = [];
    const args = [];

    if (search) {
      where.push(`(s.descripcion LIKE ? OR c.nombre LIKE ? OR ts.nombre LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (tipoId)   { where.push(`s.tipo_servicio_id = ?`); args.push(tipoId); }
    if (clienteId){ where.push(`s.cliente_id = ?`);       args.push(clienteId); }
    if (estado)   { where.push(`s.estado = ?`);           args.push(estado); }
    if (desde)    { where.push(`s.fecha_servicio >= ?`);  args.push(desde); }
    if (hasta)    { where.push(`s.fecha_servicio <= ?`);  args.push(hasta); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
        FROM servicios s
        JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
        JOIN clientes c ON c.id = s.cliente_id
      ${whereSQL}`, args
    );

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const [rows] = await pool.query(
      `SELECT s.*,
          ts.nombre  AS tipo_servicio_nombre,
          ts.precio_base,
          c.nombre   AS cliente_nombre
          FROM servicios s
          JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
          JOIN clientes c ON c.id = s.cliente_id
          ${whereSQL}
          ORDER BY s.fecha_servicio DESC, s.id DESC
          LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    res.json({
      success:true,
      data: rows,
      pagination:{ page, limit, total, totalPages, hasPrev: page>1, hasNext: page<totalPages }
    });
  } catch (e) {
    console.error('SERVICIOS list:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// GET /api/servicios/stats  -> totales por estado y monto realizado
router.get('/stats', authenticateToken, authorizePermission('servicios', 'leer'), async (_req, res) => {
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM servicios`);
    const [[{ programados }]] = await pool.query(`SELECT COUNT(*) AS programados FROM servicios WHERE estado='programado'`);
    const [[{ realizados }]] = await pool.query(`SELECT COUNT(*) AS realizados FROM servicios WHERE estado='realizado'`);
    const [[{ cancelados }]] = await pool.query(`SELECT COUNT(*) AS cancelados FROM servicios WHERE estado='cancelado'`);
    const [[{ ingresos }]] = await pool.query(`SELECT IFNULL(SUM(precio),0) AS ingresos FROM servicios WHERE estado='realizado'`);
    res.json({ success:true, data:{ total, programados, realizados, cancelados, ingresos }});
  } catch (e) {
    console.error('SERVICIOS stats:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// ========= CRUD =========
// POST /api/servicios
router.post('/', authenticateToken, authorizePermission('servicios', 'crear'), async (req, res) => {
  try {
    let {
      tipo_servicio_id,        // required (number)
      cliente_id,              // required (number)
      fecha_servicio,          // required (yyyy-MM-dd)
      hora_servicio = null,
      // descripcion,           // ❌ lo dejaremos de usar (ver punto 3)
      precio = null,           // si no viene, leer de tipos_servicio.precio_base
      estado = 'programado',   // programado | realizado | cancelado
      observaciones = null,

      // Campos de pago (punto 2)
      forma_pago = null,       // efectivo, yape, plin, transferencia, interbancario
      fecha_operacion = null,  // si no es efectivo → recomendable
      hora_operacion = null,
      nro_operacion = null,
      obs_operacion = null
    } = req.body;

    const errors = [];
    if (!tipo_servicio_id) errors.push({ field:'tipo_servicio_id', message:'Tipo de servicio requerido' });
    if (!cliente_id)       errors.push({ field:'cliente_id', message:'Cliente requerido' });
    if (!fecha_servicio)   errors.push({ field:'fecha_servicio', message:'Fecha requerida' });

    // Normaliza forma de pago
    const ALLOWED_FP = ['efectivo','yape','plin','transferencia','interbancario'];
    if (forma_pago && !ALLOWED_FP.includes(String(forma_pago).toLowerCase())) {
      errors.push({ field:'forma_pago', message:`Forma de pago inválida.` });
    }

    if (errors.length) return res.status(400).json({ success:false, errors });

    // Si no mandan precio, jalar de tipos_servicio.precio_base
    if (precio == null || precio === '') {
      const [[row]] = await pool.query(
        `SELECT precio_base FROM tipos_servicio WHERE id=? AND activo=1`,
        [tipo_servicio_id]
      );
      if (!row) return res.status(400).json({ success:false, errors:[{ field:'tipo_servicio_id', message:'Tipo de servicio no válido' }]});
      precio = row.precio_base ?? 0;
    }

    // Insert (nota: ya no usamos "descripcion", ver punto 3)
    const [r] = await pool.execute(
      `INSERT INTO servicios
        (tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio,
        precio, estado, observaciones,
        forma_pago, fecha_operacion, hora_operacion, nro_operacion, obs_operacion)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio,
        precio, estado, observaciones,
        forma_pago, fecha_operacion, hora_operacion, nro_operacion, obs_operacion
      ]
    );

    res.status(201).json({ success:true, data:{ id:r.insertId } });
  } catch (e) {
    console.error('SERVICIOS create:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});


// PUT /api/servicios/:id
router.put('/:id', authenticateToken, authorizePermission('servicios', 'actualizar'), async (req, res) => {
  try {
    const { id } = req.params;

    const [exist] = await pool.query(`SELECT * FROM servicios WHERE id=?`, [id]);
    if (!exist.length) return res.status(404).json({ success:false, error:'No encontrado' });

    const fields = [
      'tipo_servicio_id','cliente_id','fecha_servicio','hora_servicio',
      'descripcion','precio','estado','observaciones'
    ];
    const sets = [];
    const vals = [];
    fields.forEach(k => { if (k in req.body) { sets.push(`${k}=?`); vals.push(req.body[k]); } });

    if (!sets.length) return res.json({ success:true, message:'Sin cambios' });

    vals.push(id);
    await pool.execute(`UPDATE servicios SET ${sets.join(', ')} WHERE id=?`, vals);

    res.json({ success:true, message:'Actualizado' });
  } catch (e) {
    console.error('SERVICIOS update:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// DELETE /api/servicios/:id
router.delete('/:id', authenticateToken, authorizePermission('servicios', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    const [exist] = await pool.query(`SELECT * FROM servicios WHERE id=?`, [id]);
    if (!exist.length) return res.status(404).json({ success:false, error:'No encontrado' });

    await pool.execute(`DELETE FROM servicios WHERE id=?`, [id]);
    res.json({ success:true, message:'Eliminado' });
  } catch (e) {
    console.error('SERVICIOS delete:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// ========= ACCIONES DE ESTADO =========
// POST /api/servicios/:id/marcar-realizado
router.post('/:id/marcar-realizado', authenticateToken, authorizePermission('servicios', 'actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute(`UPDATE servicios SET estado='realizado' WHERE id=?`, [id]);
    res.json({ success:true, message:'Marcado como realizado' });
  } catch (e) {
    console.error('SERVICIOS marcar-realizado:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// POST /api/servicios/:id/cancelar  { observaciones? }
router.post('/:id/cancelar', authenticateToken, authorizePermission('servicios', 'actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones=null } = req.body || {};
    await pool.execute(
      `UPDATE servicios SET estado='cancelado', observaciones=IFNULL(?, observaciones) WHERE id=?`,
      [observaciones, id]
    );
    res.json({ success:true, message:'Cancelado' });
  } catch (e) {
    console.error('SERVICIOS cancelar:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

module.exports = router;
