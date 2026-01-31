// backend/routes/roles.js
/**
 * Rutas para gestión de roles y permisos
 * Endpoints para CRUD de roles y asignación de permisos
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// =====================================================
// ROLES - CRUD
// =====================================================

/**
 * GET /api/roles
 * Listar todos los roles
 */
router.get('/', authenticateToken, authorizePermission('roles_permisos.leer'), async (req, res) => {
  try {
    const [roles] = await pool.execute(`
      SELECT 
        r.id,
        r.nombre,
        r.slug,
        r.descripcion,
        r.es_admin,
        r.activo,
        r.created_at,
        r.updated_at,
        COUNT(DISTINCT rp.permiso_id) as total_permisos,
        COUNT(DISTINCT u.id) as total_usuarios
      FROM roles r
      LEFT JOIN rol_permisos rp ON r.id = rp.rol_id
      LEFT JOIN usuarios u ON u.rol_id = r.id AND u.activo = TRUE
      GROUP BY r.id
      ORDER BY r.es_admin DESC, r.nombre
    `);

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error obteniendo roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener roles'
    });
  }
});

/**
 * GET /api/roles/:id
 * Obtener un rol por ID
 */
router.get('/:id', authenticateToken, authorizePermission('roles_permisos.leer'), async (req, res) => {
  try {
    const [roles] = await pool.execute(`
      SELECT 
        r.id,
        r.nombre,
        r.slug,
        r.descripcion,
        r.es_admin,
        r.activo,
        r.created_at,
        r.updated_at
      FROM roles r
      WHERE r.id = ?
    `, [req.params.id]);

    if (roles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    res.json({
      success: true,
      data: roles[0]
    });
  } catch (error) {
    console.error('Error obteniendo rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener rol'
    });
  }
});

/**
 * POST /api/roles
 * Crear un nuevo rol
 */
router.post('/', authenticateToken, authorizePermission('roles_permisos.crear'), async (req, res) => {
  const { nombre, slug, descripcion, es_admin = false, activo = true } = req.body;

  // Validaciones
  if (!nombre || !slug) {
    return res.status(400).json({
      success: false,
      message: 'Nombre y slug son requeridos'
    });
  }

  try {
    // Verificar que el slug no exista
    const [existing] = await pool.execute(
      'SELECT id FROM roles WHERE slug = ?',
      [slug]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un rol con ese slug'
      });
    }

    // Crear el rol
    const [result] = await pool.execute(`
      INSERT INTO roles (nombre, slug, descripcion, es_admin, activo)
      VALUES (?, ?, ?, ?, ?)
    `, [nombre, slug, descripcion, es_admin, activo]);

    res.status(201).json({
      success: true,
      message: 'Rol creado exitosamente',
      data: {
        id: result.insertId,
        nombre,
        slug,
        descripcion,
        es_admin,
        activo
      }
    });
  } catch (error) {
    console.error('Error creando rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear rol'
    });
  }
});

/**
 * PUT /api/roles/:id
 * Actualizar un rol
 */
router.put('/:id', authenticateToken, authorizePermission('roles_permisos.actualizar'), async (req, res) => {
  const { nombre, slug, descripcion, es_admin, activo } = req.body;

  try {
    // Verificar que el rol exista
    const [existing] = await pool.execute('SELECT id FROM roles WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar que el slug no esté en uso por otro rol
    if (slug) {
      const [duplicated] = await pool.execute(
        'SELECT id FROM roles WHERE slug = ? AND id != ?',
        [slug, req.params.id]
      );
      if (duplicated.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe otro rol con ese slug'
        });
      }
    }

    // Construir query de actualización dinámica
    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      updates.push('nombre = ?');
      values.push(nombre);
    }
    if (slug !== undefined) {
      updates.push('slug = ?');
      values.push(slug);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }
    if (es_admin !== undefined) {
      updates.push('es_admin = ?');
      values.push(es_admin);
    }
    if (activo !== undefined) {
      updates.push('activo = ?');
      values.push(activo);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    values.push(req.params.id);

    await pool.execute(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Limpiar caché de permisos de usuarios con este rol
    const [usuarios] = await pool.execute('SELECT id FROM usuarios WHERE rol_id = ?', [req.params.id]);
    usuarios.forEach(u => authorizePermission.clearUserPermissionsCache(u.id));

    res.json({
      success: true,
      message: 'Rol actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar rol'
    });
  }
});

/**
 * DELETE /api/roles/:id
 * Eliminar un rol (soft delete)
 */
router.delete('/:id', authenticateToken, authorizePermission('roles_permisos.eliminar'), async (req, res) => {
  try {
    // Verificar que el rol existe
    const [existing] = await pool.execute('SELECT id, slug FROM roles WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // No permitir eliminar rol admin
    if (existing[0].slug === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No se puede eliminar el rol de administrador'
      });
    }

    // Verificar si hay usuarios con este rol
    const [usuarios] = await pool.execute(
      'SELECT COUNT(*) as count FROM usuarios WHERE rol_id = ? AND activo = TRUE',
      [req.params.id]
    );

    if (usuarios[0].count > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar el rol porque tiene ${usuarios[0].count} usuario(s) asignado(s)`
      });
    }

    // Soft delete
    await pool.execute('UPDATE roles SET activo = FALSE WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      message: 'Rol desactivado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar rol'
    });
  }
});

// =====================================================
// PERMISOS DE ROL
// =====================================================

/**
 * GET /api/roles/:id/permisos
 * Obtener permisos de un rol
 */
router.get('/:id/permisos', authenticateToken, authorizePermission('roles_permisos.leer'), async (req, res) => {
  try {
    const [permisos] = await pool.execute(`
      SELECT 
        m.id as modulo_id,
        m.nombre as modulo_nombre,
        m.slug as modulo_slug,
        m.categoria,
        p.id as permiso_id,
        p.accion,
        p.nombre as permiso_nombre,
        p.slug as permiso_slug,
        CASE WHEN rp.id IS NOT NULL THEN TRUE ELSE FALSE END as asignado
      FROM modulos m
      LEFT JOIN permisos p ON m.id = p.modulo_id AND p.activo = TRUE
      LEFT JOIN rol_permisos rp ON p.id = rp.permiso_id AND rp.rol_id = ?
      WHERE m.activo = TRUE
      ORDER BY m.categoria, m.orden, m.nombre, p.accion
    `, [req.params.id]);

    // Agrupar por módulo
    const permisosPorModulo = {};
    permisos.forEach(p => {
      if (!permisosPorModulo[p.modulo_slug]) {
        permisosPorModulo[p.modulo_slug] = {
          modulo_id: p.modulo_id,
          modulo_nombre: p.modulo_nombre,
          modulo_slug: p.modulo_slug,
          categoria: p.categoria,
          permisos: []
        };
      }
      
      if (p.permiso_id) {
        permisosPorModulo[p.modulo_slug].permisos.push({
          permiso_id: p.permiso_id,
          accion: p.accion,
          nombre: p.permiso_nombre,
          slug: p.permiso_slug,
          asignado: p.asignado === 1
        });
      }
    });

    res.json({
      success: true,
      data: Object.values(permisosPorModulo)
    });
  } catch (error) {
    console.error('Error obteniendo permisos del rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener permisos del rol'
    });
  }
});

/**
 * PUT /api/roles/:id/permisos
 * Actualizar permisos de un rol
 * Body: { permisos: [permiso_id1, permiso_id2, ...] }
 */
router.put('/:id/permisos', authenticateToken, authorizePermission('roles_permisos.actualizar'), async (req, res) => {
  const { permisos } = req.body;

  if (!Array.isArray(permisos)) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere un array de IDs de permisos'
    });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Verificar que el rol existe
    const [rol] = await connection.execute('SELECT id, slug FROM roles WHERE id = ?', [req.params.id]);
    if (rol.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Eliminar permisos actuales
    await connection.execute('DELETE FROM rol_permisos WHERE rol_id = ?', [req.params.id]);

    // Insertar nuevos permisos
    if (permisos.length > 0) {
      const values = permisos.map(p => [req.params.id, p]);
      await connection.query(
        'INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    // Limpiar caché de permisos de usuarios con este rol
    const [usuarios] = await pool.execute('SELECT id FROM usuarios WHERE rol_id = ?', [req.params.id]);
    usuarios.forEach(u => authorizePermission.clearUserPermissionsCache(u.id));

    res.json({
      success: true,
      message: 'Permisos actualizados exitosamente',
      data: {
        rol_id: req.params.id,
        total_permisos: permisos.length
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error actualizando permisos del rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar permisos del rol'
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
