// backend/routes/excedentes.js
/**
 * Rutas para gestión de Excedentes (Donaciones adicionales)
 * 
 * FIX: authorizePermission('ingresos') → authorizePermission('donaciones.accion')
 *      El módulo 'ingresos' NO EXISTE en la BD. El módulo correcto es 'donaciones'
 *      con permisos: donaciones_crear, donaciones_leer, donaciones_actualizar, donaciones_eliminar
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

/**
 * GET /api/excedentes
 * Listar excedentes (con filtros opcionales por fecha)
 */
router.get(
  '/',
  authenticateToken,
  authorizePermission('donaciones.leer'),
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      let sql = `
        SELECT 
          e.id,
          e.venta_id,
          e.excedente,
          e.fecha
        FROM excedentes e
      `;
      const conditions = [];
      const params = [];

      if (desde) {
        conditions.push('e.fecha >= ?');
        params.push(desde);
      }
      if (hasta) {
        conditions.push('e.fecha <= ?');
        params.push(hasta);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY e.fecha DESC, e.id DESC';

      const [rows] = await pool.execute(sql, params);

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error('Error al listar excedentes:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
      });
    }
  }
);

/**
 * GET /api/excedentes/:id
 * Obtener un excedente por ID
 */
router.get(
  '/:id',
  authenticateToken,
  authorizePermission('donaciones.leer'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [rows] = await pool.execute(
        `
        SELECT 
          e.id,
          e.venta_id,
          e.excedente,
          e.fecha
        FROM excedentes e
        WHERE e.id = ?
      `,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Excedente no encontrado',
        });
      }

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error('Error al obtener excedente:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
      });
    }
  }
);

/**
 * POST /api/excedentes
 * Crear un nuevo excedente
 */
router.post(
  '/',
  authenticateToken,
  authorizePermission('donaciones.crear'),
  async (req, res) => {
    try {
      const { venta_id, excedente, fecha } = req.body;
      const errores = [];

      if (excedente === undefined || excedente === null || excedente === '') {
        errores.push({
          field: 'excedente',
          message: 'El excedente es requerido',
        });
      }

      if (errores.length > 0) {
        return res.status(400).json({
          success: false,
          errors: errores,
          message: 'Datos inválidos',
        });
      }

      const normalizedVentaId =
        venta_id === undefined || venta_id === null || venta_id === ''
          ? null
          : String(venta_id).trim();

      const params = [normalizedVentaId, excedente];
      let sql =
        'INSERT INTO excedentes (venta_id, excedente, fecha) VALUES (?, ?, ';

      if (fecha) {
        sql += ' ?)';
        params.push(fecha);
      } else {
        sql += ' DEFAULT)';
      }

      const [result] = await pool.execute(sql, params);

      res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          venta_id: normalizedVentaId,
          excedente,
          fecha: fecha || null,
        },
        message: 'Excedente registrado correctamente',
      });
    } catch (error) {
      console.error('Error al crear excedente:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
      });
    }
  }
);

/**
 * PUT /api/excedentes/:id
 * Actualizar un excedente
 */
router.put(
  '/:id',
  authenticateToken,
  authorizePermission('donaciones.actualizar'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { venta_id, excedente, fecha } = req.body;

      const [exist] = await pool.execute(
        'SELECT id FROM excedentes WHERE id = ?',
        [id]
      );

      if (exist.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Excedente no encontrado',
        });
      }

      const fields = [];
      const params = [];

      if (venta_id !== undefined) {
        const normalizedVentaId =
          venta_id === null || venta_id === '' ? null : String(venta_id).trim();
        fields.push('venta_id = ?');
        params.push(normalizedVentaId);
      }
      if (excedente !== undefined) {
        fields.push('excedente = ?');
        params.push(excedente);
      }
      if (fecha !== undefined) {
        fields.push('fecha = ?');
        params.push(fecha);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay campos para actualizar',
        });
      }

      params.push(id);

      await pool.execute(
        `UPDATE excedentes SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      res.json({
        success: true,
        message: 'Excedente actualizado correctamente',
      });
    } catch (error) {
      console.error('Error al actualizar excedente:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
      });
    }
  }
);

/**
 * DELETE /api/excedentes/:id
 * Eliminar un excedente
 */
router.delete(
  '/:id',
  authenticateToken,
  authorizePermission('donaciones.eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [exist] = await pool.execute(
        'SELECT id FROM excedentes WHERE id = ?',
        [id]
      );

      if (exist.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Excedente no encontrado',
        });
      }

      await pool.execute('DELETE FROM excedentes WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Excedente eliminado correctamente',
      });
    } catch (error) {
      console.error('Error al eliminar excedente:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
      });
    }
  }
);

module.exports = router;
