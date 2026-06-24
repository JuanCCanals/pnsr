// backend/routes/comprobantes.js
/**
 * Rutas para gestión de comprobantes (cajas + servicios)
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');
const { isAdmin } = require('../middlewares/authorizePermission');

// GET /api/comprobantes
// Lista combinada de comprobantes de:
// - Servicios (tabla cobros + servicios + tipos_servicio)
// - Cajas (tabla ventas + benefactores)
//
// Reglas de visibilidad:
// - Admin (es_admin=1): ve TODOS los comprobantes (servicios + cajas)
// - No-admin: solo ve los SERVICIOS que registró él mismo (cobros.usuario_id = user.id).
//   Las CAJAS quedan ocultas porque ventas no tiene tracking de usuario y un
//   Operador de Servicios no debería verlas (son de otro modulo).
router.get('/', authenticateToken, authorizePermission('comprobantes.leer'), async (req, res) => {
  try {
    // Por defecto últimos 90 días (se puede ajustar con ?dias=)
    const dias = parseInt(req.query.dias || '90', 10);
    const diasValidos = Number.isNaN(dias) ? 90 : Math.min(Math.max(dias, 1), 365);

    const userId = req.user.id;
    const admin = await isAdmin(userId);

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM (
        -- Comprobantes de SERVICIOS
        -- Concepto: usa c.concepto (soporta multi-item); fallback al tipo_servicio.
        -- Cliente viene de tabla clientes (NO benefactores).
        -- metodo_pago: concatena métodos si hay pagos múltiples (ej: "Efectivo, Yape")
        SELECT
          'servicio' AS tipo,
          c.id       AS cobro_id,
          c.monto    AS monto,
          c.created_at AS fecha,
          COALESCE(c.concepto, ts.nombre) AS concepto,
          cl.nombre  AS beneficiario,
          c.numero_comprobante AS numero_comprobante,
          (
            SELECT GROUP_CONCAT(DISTINCT mp.nombre ORDER BY mp.nombre SEPARATOR ', ')
            FROM cobros_pagos cp
            JOIN metodos_pago mp ON cp.metodo_pago_id = mp.id
            WHERE cp.cobro_id = c.id
          ) AS metodo_pago,
          (
            SELECT MAX(cp.moneda = 'USD')
            FROM cobros_pagos cp
            WHERE cp.cobro_id = c.id
          ) AS pago_usd
        FROM cobros c
        LEFT JOIN servicios s
          ON c.servicio_id = s.id
        LEFT JOIN tipos_servicio ts
          ON s.tipo_servicio_id = ts.id
        LEFT JOIN clientes cl
          ON c.cliente_id = cl.id
        WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND c.caja_id IS NULL
          AND c.anulado = 0
          AND (? = 1 OR c.usuario_id = ?)

        UNION ALL

        -- Comprobantes de CAJAS
        -- Solo visibles para admin (ventas no tiene usuario_id por ahora).
        SELECT
          'caja'     AS tipo,
          v.id       AS cobro_id,
          v.monto    AS monto,
          v.created_at AS fecha,
          'Venta de cajas' AS concepto,
          b.nombre   AS beneficiario,
          NULL       AS numero_comprobante,
          (
            SELECT GROUP_CONCAT(DISTINCT vp.forma_pago ORDER BY vp.forma_pago SEPARATOR ', ')
            FROM ventas_pagos vp
            WHERE vp.venta_id = v.id
          ) AS metodo_pago,
          (
            SELECT MAX(vp.moneda = 'USD')
            FROM ventas_pagos vp
            WHERE vp.venta_id = v.id
          ) AS pago_usd
        FROM ventas v
        JOIN benefactores b
          ON v.benefactor_id = b.id
        WHERE v.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND v.anulado = 0
          AND ? = 1
      ) AS comprobantes
      ORDER BY fecha DESC
      `,
      [diasValidos, admin ? 1 : 0, userId, diasValidos, admin ? 1 : 0]
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
