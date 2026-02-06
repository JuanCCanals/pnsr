// backend/routes/permisos.js
/**
 * Rutas para gestión de permisos
 * Incluye endpoints para obtener, crear, actualizar y eliminar permisos
 * 
 * FIX: Columna 'modulo' no existe en tabla permisos → usar modulo_id con JOIN
 * FIX: authorizePermission recibe UN solo argumento → formato 'modulo.accion'
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

/**
 * GET /api/permisos
 * Obtener todos los permisos disponibles
 * FIX: Ahora hace JOIN con modulos para obtener el nombre del módulo
 */
router.get('/', authenticateToken, authorizePermission('usuarios.leer'), async (req, res) => {
  try {
    const [permisos] = await pool.execute(`
      SELECT 
        p.id, 
        p.modulo_id,
        m.slug AS modulo,
        m.nombre AS modulo_nombre,
        p.accion,
        p.nombre, 
        p.slug,
        p.descripcion, 
        p.activo, 
        p.created_at 
      FROM permisos p
      JOIN modulos m ON p.modulo_id = m.id
      ORDER BY m.orden, m.nombre, p.accion
    `);

    res.json({
      success: true,
      data: permisos
    });
  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/permisos/:id
 * Obtener un permiso específico
 */
router.get('/:id', authenticateToken, authorizePermission('usuarios.leer'), async (req, res) => {
  try {
    const { id } = req.params;

    const [permisos] = await pool.execute(`
      SELECT 
        p.id, 
        p.modulo_id,
        m.slug AS modulo,
        m.nombre AS modulo_nombre,
        p.accion,
        p.nombre, 
        p.slug,
        p.descripcion, 
        p.activo
      FROM permisos p
      JOIN modulos m ON p.modulo_id = m.id
      WHERE p.id = ?
    `, [id]);

    if (permisos.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Permiso no encontrado'
      });
    }

    res.json({
      success: true,
      data: permisos[0]
    });
  } catch (error) {
    console.error('Error al obtener permiso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/permisos
 * Crear un nuevo permiso (solo admin)
 */
router.post('/', authenticateToken, authorizePermission('usuarios.crear'), async (req, res) => {
  try {
    const { modulo_id, accion, nombre, slug, descripcion, activo } = req.body;

    // Validaciones
    if (!modulo_id || !accion || !nombre || !slug) {
      return res.status(400).json({
        success: false,
        error: 'modulo_id, accion, nombre y slug son requeridos'
      });
    }

    // Verificar si el slug ya existe
    const [existing] = await pool.execute(
      'SELECT id FROM permisos WHERE slug = ?',
      [slug]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un permiso con ese slug'
      });
    }

    // Insertar permiso
    const [result] = await pool.execute(
      'INSERT INTO permisos (modulo_id, accion, nombre, slug, descripcion, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [modulo_id, accion, nombre, slug, descripcion || null, activo !== false]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        modulo_id,
        accion,
        nombre,
        slug,
        descripcion: descripcion || null,
        activo: activo !== false
      },
      message: 'Permiso creado exitosamente'
    });
  } catch (error) {
    console.error('Error al crear permiso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * PUT /api/permisos/:id
 * Actualizar un permiso (solo admin)
 */
router.put('/:id', authenticateToken, authorizePermission('usuarios.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, activo } = req.body;

    // Verificar si existe
    const [existing] = await pool.execute(
      'SELECT id FROM permisos WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Permiso no encontrado'
      });
    }

    // Preparar campos para actualizar
    let updateFields = [];
    let updateValues = [];

    if (nombre) {
      updateFields.push('nombre = ?');
      updateValues.push(nombre);
    }
    if (descripcion !== undefined) {
      updateFields.push('descripcion = ?');
      updateValues.push(descripcion || null);
    }
    if (activo !== undefined) {
      updateFields.push('activo = ?');
      updateValues.push(activo);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE permisos SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    res.json({
      success: true,
      message: 'Permiso actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar permiso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * DELETE /api/permisos/:id
 * Eliminar un permiso (solo admin)
 */
router.delete('/:id', authenticateToken, authorizePermission('usuarios.eliminar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si existe
    const [existing] = await pool.execute(
      'SELECT id FROM permisos WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Permiso no encontrado'
      });
    }

    // Eliminar asignaciones del permiso en rol_permisos
    await pool.execute(
      'DELETE FROM rol_permisos WHERE permiso_id = ?',
      [id]
    );

    // Eliminar asignaciones del permiso en usuario_permisos
    await pool.execute(
      'DELETE FROM usuario_permisos WHERE permiso_id = ?',
      [id]
    );

    // Eliminar permiso
    await pool.execute(
      'DELETE FROM permisos WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Permiso eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar permiso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;
