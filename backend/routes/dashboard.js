// backend/routes/dashboard.js
/**
 * Rutas para dashboards
 * Incluye endpoints para KPIs de Cajas del Amor y Servicios Parroquiales
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

/**
 * GET /api/dashboard/cajas
 * Obtener KPIs para dashboard de Cajas del Amor
 */
// backend/routes/dashboard.js

// backend/routes/dashboard.js

router.get(
  '/cajas',
  authenticateToken,
  authorizePermission('dashboard_cajas'),
  async (req, res) => {
    try {
      // 1) Total de cajas de S/40 y S/160, según movimientos registrados
      const [cajasCount] = await pool.execute(`
        SELECT 
          SUM(CASE WHEN vc.monto = 40 THEN 1 ELSE 0 END) AS cajas_40,
          SUM(CASE WHEN vc.monto = 160 THEN 1 ELSE 0 END) AS cajas_160,
          COUNT(*) AS total_cajas
        FROM ventas_cajas vc
      `);

      // 2) Cajas vendidas (pagadas) y montos
      const [cajasVendidas] = await pool.execute(`
        SELECT 
          COUNT(DISTINCT vc.caja_id) AS cantidad,
          SUM(CASE WHEN vc.monto = 40 THEN vc.monto ELSE 0 END) AS monto_40,
          SUM(CASE WHEN vc.monto = 160 THEN vc.monto ELSE 0 END) AS monto_160,
          SUM(vc.monto) AS total_recaudado
        FROM ventas_cajas vc
        WHERE vc.estado_pago = 'PAGADO'
      `);

      // 3) Cajas no vendidas (stock disponible)
      const [cajasNoVendidas] = await pool.execute(`
        SELECT COUNT(*) AS cantidad
        FROM cajas
        WHERE estado = 'disponible'
      `);

      // 4) Familias beneficiadas (familias activas)
      const [familias] = await pool.execute(`
        SELECT COUNT(*) AS total
        FROM familias
        WHERE activo = 1
      `);

      // 5) Cajas entregadas a benefactores (movimiento ENTREGADA en ventas_cajas)
      const [cajasEntregadas] = await pool.execute(`
        SELECT COUNT(DISTINCT vc.caja_id) AS cantidad
        FROM ventas_cajas vc
        WHERE vc.estado_movimiento = 'ENTREGADA'
      `);

      // 6) Cajas devueltas llenas (según tabla cajas)
      const [cajasDevueltas] = await pool.execute(`
        SELECT COUNT(*) AS cantidad
        FROM cajas
        WHERE estado = 'devuelta_llena'
      `);

      // 7) Ventas por día (últimos 7 días)
      const [ventasPorDia] = await pool.execute(`
        SELECT 
          DATE(v.created_at) AS fecha,
          COUNT(*) AS cantidad,
          SUM(v.monto) AS monto
        FROM ventas v
        WHERE v.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(v.created_at)
        ORDER BY fecha DESC
      `);

      // 8) Top benefactores por monto
      const [topBenefactores] = await pool.execute(`
        SELECT 
          b.nombre,
          COUNT(v.id) AS cantidad_cajas,
          SUM(v.monto) AS monto_total
        FROM ventas v
        JOIN benefactores b ON v.benefactor_id = b.id
        GROUP BY b.id, b.nombre
        ORDER BY monto_total DESC
        LIMIT 5
      `);

      // 9) Ventas por punto de venta
      const [ventasPorPV] = await pool.execute(`
        SELECT 
          pv.nombre,
          COUNT(v.id) AS cantidad,
          SUM(v.monto) AS monto
        FROM ventas v
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        GROUP BY pv.id, pv.nombre
        ORDER BY monto DESC
      `);

      // NO usamos campanias.meta_monto ni meta_cajas.
      // Si el frontend espera esos campos, los devolvemos en 0 para no romper nada.
      const meta_monto = 0;
      const meta_cajas = 0;
      const porcentaje_avance = 0;

      res.json({
        success: true,
        data: {
          kpis: {
            cajas_40: cajasCount[0]?.cajas_40 || 0,
            cajas_160: cajasCount[0]?.cajas_160 || 0,
            total_cajas: cajasCount[0]?.total_cajas || 0,
            cajas_vendidas: cajasVendidas[0]?.cantidad || 0,
            monto_cajas_40: cajasVendidas[0]?.monto_40 || 0,
            monto_cajas_160: cajasVendidas[0]?.monto_160 || 0,
            total_recaudado: cajasVendidas[0]?.total_recaudado || 0,
            cajas_no_vendidas: cajasNoVendidas[0]?.cantidad || 0,
            familias_beneficiadas: familias[0]?.total || 0,
            cajas_entregadas: cajasEntregadas[0]?.cantidad || 0,
            cajas_devueltas: cajasDevueltas[0]?.cantidad || 0,
            meta_monto,
            meta_cajas,
            porcentaje_avance
          },
          graficos: {
            ventas_por_dia: ventasPorDia,
            top_benefactores: topBenefactores,
            ventas_por_punto_venta: ventasPorPV
          }
        }
      });
    } catch (error) {
      console.error('Error en dashboard cajas:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }
);

module.exports = router;
