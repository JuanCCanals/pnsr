// backend/routes/comprobantes.js
/**
 * Rutas para gestión de comprobantes (cajas + servicios)
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// GET /api/comprobantes
// Lista combinada de comprobantes de:
// - Servicios (tabla cobros + servicios + tipos_servicio)
// - Cajas (tabla ventas + benefactores)
router.get('/', authenticateToken, authorizePermission('comprobantes', 'leer'), async (req, res) => {
  try {
    // Por defecto últimos 90 días (se puede ajustar con ?dias=)
    const dias = parseInt(req.query.dias || '90', 10);
    const diasValidos = Number.isNaN(dias) ? 90 : Math.min(Math.max(dias, 1), 365);

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM (
        -- Comprobantes de SERVICIOS
        SELECT
          'servicio' AS tipo,
          c.id       AS cobro_id,
          c.monto    AS monto,
          c.created_at AS fecha,
          ts.nombre  AS concepto,
          cl.nombre  AS beneficiario,
          c.numero_comprobante AS numero_comprobante
        FROM cobros c
        JOIN servicios s
          ON c.servicio_id = s.id
        JOIN tipos_servicio ts
          ON s.tipo_servicio_id = ts.id
        LEFT JOIN benefactores cl
          ON c.cliente_id = cl.id
        WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)

        UNION ALL

        -- Comprobantes de CAJAS
        SELECT
          'caja'     AS tipo,
          v.id       AS cobro_id,
          v.monto    AS monto,
          v.created_at AS fecha,
          'Venta de cajas' AS concepto,
          b.nombre   AS beneficiario,
          NULL       AS numero_comprobante
        FROM ventas v
        JOIN benefactores b
          ON v.benefactor_id = b.id
        WHERE v.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ) AS comprobantes
      ORDER BY fecha DESC
      `,
      [diasValidos, diasValidos]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('Error en /api/comprobantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
});

module.exports = router;
