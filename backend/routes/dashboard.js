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
router.get(
  '/cajas',
  authenticateToken,
  authorizePermission('dashboard'),
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

      // 5) Cajas entregadas a benefactores
      const [cajasEntregadas] = await pool.execute(`
        SELECT COUNT(DISTINCT vc.caja_id) AS cantidad
        FROM ventas_cajas vc
        WHERE vc.estado_movimiento = 'ENTREGADA'
      `);

      // 6) Cajas devueltas llenas
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

      // Meta (opcional, si no usas campañas lo dejamos en 0)
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

/**
 * GET /api/dashboard/servicios
 * Obtener KPIs para dashboard de Servicios Parroquiales
 */
router.get(
  '/servicios',
  authenticateToken,
  authorizePermission('dashboard'),
  async (req, res) => {
    try {
      // 1) Total de servicios y tipos principales
      const [kpisResult] = await pool.execute(`
        SELECT 
          COUNT(s.id) as total_servicios,
          SUM(CASE WHEN ts.nombre LIKE '%Bautismo%' THEN 1 ELSE 0 END) as bautismos,
          SUM(CASE WHEN ts.nombre LIKE '%Matrimonio%' THEN 1 ELSE 0 END) as matrimonios,
          SUM(CASE WHEN ts.nombre NOT LIKE '%Bautismo%' AND ts.nombre NOT LIKE '%Matrimonio%' THEN 1 ELSE 0 END) as otros_servicios,
          COALESCE(SUM(c.monto), 0) as total_recaudado
        FROM servicios s
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        LEFT JOIN cobros c ON s.id = c.servicio_id
      `);

      const kpis = kpisResult[0] || {};

      // 2) Estado de servicios
      const [serviciosEstado] = await pool.execute(`
        SELECT 
          s.estado,
          COUNT(*) as cantidad
        FROM servicios s
        GROUP BY s.estado
      `);

      kpis.servicios_estado = {};
      serviciosEstado.forEach(row => {
        kpis.servicios_estado[row.estado] = row.cantidad;
      });

      // 3) Servicios por tipo
      const [serviciosPorTipo] = await pool.execute(`
        SELECT 
          ts.nombre,
          COUNT(s.id) as cantidad
        FROM servicios s
        JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        GROUP BY ts.id, ts.nombre
        ORDER BY cantidad DESC
      `);

      // 4) Top servicios (últimos 30 días)
      const [topServicios] = await pool.execute(`
        SELECT 
          ts.nombre,
          COUNT(s.id) as cantidad
        FROM servicios s
        JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        WHERE s.fecha_servicio >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY ts.id, ts.nombre
        ORDER BY cantidad DESC
        LIMIT 5
      `);

      // 5) Servicios por mes (últimos 6 meses)
      const [serviciosPorMes] = await pool.execute(`
        SELECT 
          DATE_FORMAT(s.fecha_servicio, '%Y-%m') as fecha,
          COUNT(*) as cantidad
        FROM servicios s
        WHERE s.fecha_servicio >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(s.fecha_servicio, '%Y-%m')
        ORDER BY fecha DESC
        LIMIT 6
      `);

      res.json({
        success: true,
        data: {
          kpis,
          graficos: {
            servicios_por_tipo: serviciosPorTipo,
            top_servicios: topServicios,
            servicios_por_mes: serviciosPorMes
          }
        }
      });
    } catch (error) {
      console.error('Error en dashboard servicios:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }
);

/**
 * GET /api/dashboard/kpis
 * Endpoint legacy - mantener para compatibilidad
 */
router.get('/kpis', authenticateToken, async (req, res) => {
  const { campania_id } = req.query;
  try {
    const whereCamp = campania_id ? 'AND z.campania_id = ?' : '';
    const params = campania_id ? [campania_id] : [];

    const [totales] = await pool.query(
      `SELECT 
         SUM(c.estado='disponible') AS disponibles,
         SUM(c.estado='asignada') AS asignadas,
         SUM(c.estado='entregada') AS entregadas,
         SUM(c.estado='devuelta')  AS devueltas
       FROM cajas c
       JOIN zonas z ON z.id = c.zona_id
       WHERE 1=1 ${whereCamp}`,
      params
    );

    res.json(totales[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error obteniendo KPIs' });
  }
});

module.exports = router;
