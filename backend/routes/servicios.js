// /Server/routes/servicios.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');
const { isAdmin } = require('../middlewares/authorizePermission');

// Módulo: servicios (modulo_id = 10 en BD)

// helpers
const norm = v => (v ?? '').toString().trim();
const toInt = v => Number.parseInt(v, 10);

// Validar ownership de un servicio (o ser admin).
// Retorna { ok: true } si tiene acceso, o { ok: false, status, error } si no.
async function ensureServicioOwnership(servicioId, userId) {
  if (await isAdmin(userId)) return { ok: true, admin: true };
  const [rows] = await pool.query('SELECT usuario_id FROM servicios WHERE id = ?', [servicioId]);
  if (!rows.length) return { ok: false, status: 404, error: 'No encontrado' };
  if (rows[0].usuario_id !== userId) {
    return { ok: false, status: 403, error: 'No tienes permiso para acceder a este servicio' };
  }
  return { ok: true, admin: false };
}

// ========= CONFIG =========
// GET /api/servicios/config/tipos  -> lee de tipos_servicio
router.get('/config/tipos', authenticateToken, authorizePermission('servicios.leer'), async (_req, res) => {
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
router.get('/config/formas-pago', authenticateToken, authorizePermission('servicios.leer'), async (_req, res) => {
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
router.get('/', authenticateToken, authorizePermission('servicios.leer'), async (req, res) => {
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

    // Filtro de ownership: usuarios no-admin solo ven sus propios servicios.
    // Admins (roles.es_admin = 1) ven todo.
    if (!(await isAdmin(req.user.id))) {
      where.push(`s.usuario_id = ?`);
      args.push(req.user.id);
    }

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
          c.nombre   AS cliente_nombre,
          c.dni      AS cliente_dni,
          c.telefono AS cliente_telefono,
          c.email    AS cliente_email,
          COALESCE(
            (SELECT cs.cobro_id FROM cobro_servicios cs WHERE cs.servicio_id = s.id ORDER BY cs.cobro_id DESC LIMIT 1),
            (SELECT co.id FROM cobros co WHERE co.servicio_id = s.id ORDER BY co.id DESC LIMIT 1)
          ) AS cobro_id
          FROM servicios s
          JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
          JOIN clientes c ON c.id = s.cliente_id
          ${whereSQL}
          ORDER BY s.id DESC
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
router.get('/stats', authenticateToken, authorizePermission('servicios.leer'), async (_req, res) => {
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
router.post('/', authenticateToken, authorizePermission('servicios.crear'), async (req, res) => {
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
        precio, estado, observaciones, usuario_id)
        VALUES (?,?,?,?,?,?,?,?)`,
      [
        tipo_servicio_id, cliente_id, fecha_servicio, hora_servicio,
        precio, estado, observaciones, req.user?.id || null
      ]
    );

    res.status(201).json({ success:true, data:{ id:r.insertId } });
  } catch (e) {
    console.error('SERVICIOS create:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});


// PUT /api/servicios/:id
router.put('/:id', authenticateToken, authorizePermission('servicios.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;

    const own = await ensureServicioOwnership(id, req.user.id);
    if (!own.ok) return res.status(own.status).json({ success:false, error: own.error });

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
router.delete('/:id', authenticateToken, authorizePermission('servicios.eliminar'), async (req, res) => {
  try {
    const { id } = req.params;

    const own = await ensureServicioOwnership(id, req.user.id);
    if (!own.ok) return res.status(own.status).json({ success:false, error: own.error });

    await pool.execute(`DELETE FROM servicios WHERE id=?`, [id]);
    res.json({ success:true, message:'Eliminado' });
  } catch (e) {
    console.error('SERVICIOS delete:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// ========= ACCIONES DE ESTADO =========
// POST /api/servicios/:id/marcar-realizado
router.post('/:id/marcar-realizado', authenticateToken, authorizePermission('servicios.actualizar'), async (req, res) => {
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
router.post('/:id/cancelar', authenticateToken, authorizePermission('servicios.actualizar'), async (req, res) => {
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

// POST /api/servicios/:id/anular  { motivo }
// Anulacion completa (Modelo A): un solo boton "Anulacion" reemplaza al
// Eliminar y Cancelar viejos. Hace lo siguiente, en transaccion:
//   1. Encuentra los cobros asociados al servicio (via cobro_servicios.cobro_id
//      o via cobros.servicio_id en el flujo legacy single-item).
//   2. Para cada cobro asociado: marca anulado=1 + motivo + anulado_por + anulado_at.
//   3. Si el cobro es multi-item, TODOS sus servicios quedan cancelados (porque
//      el comprobante fisico cubre todos los items juntos: no tiene sentido
//      anular un solo item).
//   4. Si el servicio no tiene cobro asociado (solo se programo, nunca se cobro)
//      marca solo el servicio como cancelado.
// El motivo es obligatorio para mantener auditoria.
router.post('/:id/anular', authenticateToken, authorizePermission('servicios.actualizar'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const motivo = String((req.body && req.body.motivo) || '').trim();
    if (!motivo) {
      conn.release();
      return res.status(400).json({ success: false, error: 'El motivo de anulacion es obligatorio' });
    }

    // Validar ownership del servicio (admin bypass)
    const own = await ensureServicioOwnership(id, req.user.id);
    if (!own.ok) {
      conn.release();
      return res.status(own.status).json({ success: false, error: own.error });
    }

    await conn.beginTransaction();

    // 1) Encontrar cobros asociados: prioritariamente via cobro_servicios
    //    (flujo multi-item actual); fallback via cobros.servicio_id (legacy).
    const [cobroLinks] = await conn.query(
      `SELECT DISTINCT cs.cobro_id
       FROM cobro_servicios cs
       WHERE cs.servicio_id = ?
       UNION
       SELECT id AS cobro_id FROM cobros WHERE servicio_id = ?`,
      [id, id]
    );
    const cobroIds = cobroLinks.map(r => r.cobro_id).filter(Boolean);

    const userId = req.user.id;
    let serviciosAfectados = [parseInt(id, 10)];

    if (cobroIds.length) {
      // 2) Anular los cobros (preserva historial completo)
      const ph = cobroIds.map(() => '?').join(',');
      await conn.execute(
        `UPDATE cobros
           SET anulado = 1, motivo_anulacion = ?, anulado_por = ?, anulado_at = NOW()
         WHERE id IN (${ph})`,
        [motivo, userId, ...cobroIds]
      );

      // 3) Cancelar TODOS los servicios de esos cobros (multi-item incluido)
      const [linkedServ] = await conn.query(
        `SELECT DISTINCT servicio_id FROM cobro_servicios WHERE cobro_id IN (${ph}) AND servicio_id IS NOT NULL
         UNION
         SELECT servicio_id FROM cobros WHERE id IN (${ph}) AND servicio_id IS NOT NULL`,
        [...cobroIds, ...cobroIds]
      );
      const allServiceIds = Array.from(new Set([
        ...linkedServ.map(r => r.servicio_id),
        parseInt(id, 10),
      ])).filter(Boolean);

      if (allServiceIds.length) {
        const phS = allServiceIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE servicios
             SET estado='cancelado',
                 observaciones = CONCAT(IFNULL(observaciones, ''), CASE WHEN observaciones IS NULL OR observaciones='' THEN '' ELSE ' | ' END, 'ANULADO: ', ?)
           WHERE id IN (${phS})`,
          [motivo, ...allServiceIds]
        );
        serviciosAfectados = allServiceIds;
      }
    } else {
      // 4) Servicio sin cobro: solo marcar como cancelado
      await conn.execute(
        `UPDATE servicios
           SET estado='cancelado',
               observaciones = CONCAT(IFNULL(observaciones, ''), CASE WHEN observaciones IS NULL OR observaciones='' THEN '' ELSE ' | ' END, 'ANULADO: ', ?)
         WHERE id = ?`,
        [motivo, id]
      );
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'Servicio anulado',
      data: {
        servicios_anulados: serviciosAfectados,
        cobros_anulados: cobroIds,
      },
    });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('SERVICIOS anular:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    conn.release();
  }
});

module.exports = router;
