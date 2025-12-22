// backend/routes/permisos.js
/**
 * Rutas para gestión de permisos
 * Incluye endpoints para obtener, crear, actualizar y eliminar permisos
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

/**
 * GET /api/permisos
 * Obtener todos los permisos disponibles
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [permisos] = await pool.execute(
      'SELECT id, modulo, nombre, descripcion, activo, created_at FROM permisos ORDER BY modulo, nombre'
    );

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
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [permisos] = await pool.execute(
      'SELECT id, modulo, nombre, descripcion, activo FROM permisos WHERE id = ?',
      [id]
    );

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
router.post('/', authenticateToken, authorizePermission('usuarios'), async (req, res) => {
  try {
    const { modulo, nombre, descripcion, activo } = req.body;

    // Validaciones
    if (!modulo || !nombre) {
      return res.status(400).json({
        success: false,
        error: 'El módulo y nombre son requeridos'
      });
    }

    // Verificar si el módulo ya existe
    const [existing] = await pool.execute(
      'SELECT id FROM permisos WHERE modulo = ?',
      [modulo]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'El módulo ya existe'
      });
    }

    // Insertar permiso
    const [result] = await pool.execute(
      'INSERT INTO permisos (modulo, nombre, descripcion, activo) VALUES (?, ?, ?, ?)',
      [modulo, nombre, descripcion || null, activo !== false]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        modulo,
        nombre,
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
router.put('/:id', authenticateToken, authorizePermission('usuarios'), async (req, res) => {
  try {
    const { id } = req.params;
    const { modulo, nombre, descripcion, activo } = req.body;

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

    if (modulo) {
      updateFields.push('modulo = ?');
      updateValues.push(modulo);
    }
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
router.delete('/:id', authenticateToken, authorizePermission('usuarios'), async (req, res) => {
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

    // Eliminar asignaciones del permiso
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
