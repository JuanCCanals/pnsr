// backend/routes/modulos.js
/**
 * Rutas para consultar módulos y permisos disponibles en el sistema
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

/**
 * GET /api/modulos
 * Listar todos los módulos del sistema
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [modulos] = await pool.execute(`
      SELECT 
        id,
        nombre,
        slug,
        descripcion,
        icono,
        ruta,
        orden,
        categoria,
        activo
      FROM modulos
      WHERE activo = TRUE
      ORDER BY categoria, orden, nombre
    `);

    res.json({
      success: true,
      data: modulos
    });
  } catch (error) {
    console.error('Error obteniendo módulos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener módulos'
    });
  }
});

/**
 * GET /api/modulos/categorias
 * Listar módulos agrupados por categoría
 */
router.get('/categorias', authenticateToken, async (req, res) => {
  try {
    const [modulos] = await pool.execute(`
      SELECT 
        categoria,
        id,
        nombre,
        slug,
        descripcion,
        ruta,
        orden
      FROM modulos
      WHERE activo = TRUE
      ORDER BY categoria, orden, nombre
    `);

    // Agrupar por categoría
    const porCategoria = {};
    modulos.forEach(m => {
      if (!porCategoria[m.categoria]) {
        porCategoria[m.categoria] = [];
      }
      porCategoria[m.categoria].push({
        id: m.id,
        nombre: m.nombre,
        slug: m.slug,
        descripcion: m.descripcion,
        ruta: m.ruta,
        orden: m.orden
      });
    });

    res.json({
      success: true,
      data: porCategoria
    });
  } catch (error) {
    console.error('Error obteniendo módulos por categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener módulos'
    });
  }
});

/**
 * GET /api/modulos/:slug/permisos
 * Obtener permisos de un módulo específico
 */
router.get('/:slug/permisos', authenticateToken, async (req, res) => {
  try {
    const [permisos] = await pool.execute(`
      SELECT 
        p.id,
        p.accion,
        p.nombre,
        p.slug,
        p.descripcion
      FROM permisos p
      JOIN modulos m ON p.modulo_id = m.id
      WHERE m.slug = ? AND p.activo = TRUE
      ORDER BY 
        CASE p.accion
          WHEN 'leer' THEN 1
          WHEN 'crear' THEN 2
          WHEN 'actualizar' THEN 3
          WHEN 'eliminar' THEN 4
          WHEN 'exportar' THEN 5
          WHEN 'importar' THEN 6
          ELSE 7
        END
    `, [req.params.slug]);

    if (permisos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Módulo no encontrado o sin permisos'
      });
    }

    res.json({
      success: true,
      data: permisos
    });
  } catch (error) {
    console.error('Error obteniendo permisos del módulo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener permisos del módulo'
    });
  }
});

/**
 * GET /api/modulos/all/permisos
 * Obtener todos los módulos con sus permisos
 */
router.get('/all/permisos', authenticateToken, async (req, res) => {
  try {
    const [data] = await pool.execute(`
      SELECT 
        m.id as modulo_id,
        m.nombre as modulo_nombre,
        m.slug as modulo_slug,
        m.categoria,
        m.orden,
        p.id as permiso_id,
        p.accion,
        p.nombre as permiso_nombre,
        p.slug as permiso_slug
      FROM modulos m
      LEFT JOIN permisos p ON m.id = p.modulo_id AND p.activo = TRUE
      WHERE m.activo = TRUE
      ORDER BY m.categoria, m.orden, m.nombre, 
        CASE p.accion
          WHEN 'leer' THEN 1
          WHEN 'crear' THEN 2
          WHEN 'actualizar' THEN 3
          WHEN 'eliminar' THEN 4
          WHEN 'exportar' THEN 5
          WHEN 'importar' THEN 6
          ELSE 7
        END
    `);

    // Agrupar por módulo
    const modulosConPermisos = {};
    data.forEach(row => {
      if (!modulosConPermisos[row.modulo_slug]) {
        modulosConPermisos[row.modulo_slug] = {
          modulo_id: row.modulo_id,
          nombre: row.modulo_nombre,
          slug: row.modulo_slug,
          categoria: row.categoria,
          orden: row.orden,
          permisos: []
        };
      }

      if (row.permiso_id) {
        modulosConPermisos[row.modulo_slug].permisos.push({
          id: row.permiso_id,
          accion: row.accion,
          nombre: row.permiso_nombre,
          slug: row.permiso_slug
        });
      }
    });

    res.json({
      success: true,
      data: Object.values(modulosConPermisos)
    });
  } catch (error) {
    console.error('Error obteniendo módulos y permisos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener módulos y permisos'
    });
  }
});

module.exports = router;
