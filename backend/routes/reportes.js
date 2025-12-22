/**
 * Rutas para reportes completos
 * Incluye reportes de Cajas del Amor y Servicios Parroquiales
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// ==================== REPORTES CAJAS DEL AMOR ====================

/**
 * GET /api/reportes/cajas/familias
 * Reporte: Listado completo de familias beneficiadas con todos sus datos
 * Incluye: código, responsable, dirección, zona, cantidad de integrantes y monto de caja
 */
router.get(
  '/cajas/familias',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { zona_id, estado_caja } = req.query;

      // Listado de familias beneficiadas con todos los datos
      let query = `
        SELECT 
          f.id,
          f.codigo_unico AS codigo,
          COALESCE(NULLIF(f.nombre_padre, ''), f.nombre_madre) AS nombre_responsable,
          f.direccion,
          z.nombre AS zona,
          COUNT(DISTINCT i.id) AS integrantes,
          COALESCE(MAX(vc.monto), 0) AS caja_monto
        FROM familias f
        LEFT JOIN zonas z ON f.zona_id = z.id
        LEFT JOIN integrantes_familia i ON f.id = i.familia_id
        LEFT JOIN cajas c ON c.familia_id = f.id
        LEFT JOIN ventas_cajas vc ON vc.caja_id = c.id
        WHERE f.activo = 1
      `;

      const params = [];

      if (zona_id) {
        query += ' AND f.zona_id = ?';
        params.push(zona_id);
      }

      if (estado_caja) {
        query += ' AND c.estado = ?';
        params.push(estado_caja);
      }

      query += `
        GROUP BY 
          f.id,
          f.codigo_unico,
          f.nombre_padre,
          f.nombre_madre,
          f.direccion,
          z.nombre
        ORDER BY 
          z.nombre,
          nombre_responsable
      `;

      const [familias] = await pool.execute(query, params);

      res.json({
        success: true,
        data: familias,
        total: familias.length,
      });
    } catch (error) {
      console.error('Error en reporte familias:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/zonas
 * Reporte: Zonas beneficiadas y cantidad de familias por zona
 * Incluye: nombre de zona, cantidad de familias, cajas vendidas y disponibles
 */
router.get(
  '/cajas/zonas',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      // Listado de zonas beneficiadas con conteo de familias y cajas
      const [zonas] = await pool.execute(`
        SELECT 
          z.id,
          z.nombre,
          COUNT(DISTINCT f.id) AS familias,
          COUNT(DISTINCT c.id) AS cajas,
          SUM(CASE WHEN c.estado = 'entregada' THEN 1 ELSE 0 END) AS cajas_vendidas,
          SUM(CASE WHEN c.estado = 'disponible' THEN 1 ELSE 0 END) AS cajas_disponibles
        FROM zonas z
        LEFT JOIN familias f ON z.id = f.zona_id AND f.activo = 1
        LEFT JOIN cajas c ON c.familia_id = f.id
        GROUP BY z.id, z.nombre
        ORDER BY z.nombre
      `);

      res.json({
        success: true,
        data: zonas,
        total: zonas.length,
      });
    } catch (error) {
      console.error('Error en reporte zonas:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/ubicacion
 * Reporte: Ubicación de cajas - dónde están siendo asignadas
 * Estados: disponible, asignada, entregada (vendida), devuelta (no vendida/completa)
 * Asunción: "entregada" = vendida al benefactor
 */
router.get(
  '/cajas/ubicacion',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { estado, punto_venta_id, zona_id } = req.query;

      // Ubicación de cajas con su estado actual y punto de venta
      let query = `
        SELECT 
          c.id,
          c.codigo,
          vc.monto AS monto,
          c.estado,
          c.punto_venta_id,
          pv.nombre AS punto_venta,
          f.id AS familia_id,
          COALESCE(NULLIF(f.nombre_padre, ''), f.nombre_madre) AS nombre_responsable,
          z.nombre AS zona,
          c.created_at
        FROM cajas c
        LEFT JOIN puntos_venta pv ON c.punto_venta_id = pv.id
        LEFT JOIN familias f ON c.familia_id = f.id
        LEFT JOIN zonas z ON f.zona_id = z.id
        LEFT JOIN ventas_cajas vc ON vc.caja_id = c.id
        WHERE 1 = 1
      `;

      const params = [];

      if (estado) {
        query += ' AND c.estado = ?';
        params.push(estado);
      }

      if (punto_venta_id) {
        query += ' AND c.punto_venta_id = ?';
        params.push(punto_venta_id);
      }

      if (zona_id) {
        query += ' AND z.id = ?';
        params.push(zona_id);
      }

      query += ' ORDER BY c.estado, c.codigo';

      const [cajas] = await pool.execute(query, params);

      res.json({
        success: true,
        data: cajas,
        total: cajas.length,
      });
    } catch (error) {
      console.error('Error en reporte ubicación:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/ventas
 * Reporte: Venta de cajas con todos los detalles
 * Incluye: fecha, punto de venta, tipo de caja (40/160), benefactor, forma de pago
 */
router.get(
  '/cajas/ventas',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { desde, hasta, punto_venta_id, forma_pago } = req.query;

      // Ventas de cajas con detalle completo
      let query = `
        SELECT 
          v.id,
          v.recibo AS numero_comprobante,
          v.fecha AS fecha_venta,
          pv.nombre AS punto_venta,
          b.nombre AS benefactor,
          (
            SELECT COUNT(DISTINCT vc2.caja_id) 
            FROM ventas_cajas vc2 
            WHERE vc2.benefactor_id = v.benefactor_id 
              AND DATE(vc2.fecha) = v.fecha
          ) AS cantidad_cajas,
          (
            SELECT COUNT(DISTINCT vc3.caja_id)
            FROM ventas_cajas vc3
            WHERE vc3.benefactor_id = v.benefactor_id
              AND DATE(vc3.fecha) = v.fecha
              AND vc3.modalidad_id = 1
          ) AS cajas_40,
          (
            SELECT COUNT(DISTINCT vc4.caja_id)
            FROM ventas_cajas vc4
            WHERE vc4.benefactor_id = v.benefactor_id
              AND DATE(vc4.fecha) = v.fecha
              AND vc4.modalidad_id = 2
          ) AS cajas_160,
          v.monto AS monto_total,
          v.forma_pago
        FROM ventas v
        LEFT JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        LEFT JOIN benefactores b ON v.benefactor_id = b.id
        WHERE 1 = 1
      `;

      const params = [];

      if (desde) {
        query += ' AND v.fecha >= ?';
        params.push(desde);
      }

      if (hasta) {
        query += ' AND v.fecha <= ?';
        params.push(hasta);
      }

      if (punto_venta_id) {
        query += ' AND v.punto_venta_id = ?';
        params.push(punto_venta_id);
      }

      if (forma_pago) {
        query += ' AND v.forma_pago = ?';
        params.push(forma_pago);
      }

      query += ' ORDER BY v.fecha DESC, v.id DESC';

      const [ventas] = await pool.execute(query, params);

      res.json({
        success: true,
        data: ventas,
        total: ventas.length,
      });
    } catch (error) {
      console.error('Error en reporte ventas:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/recaudacion
 * Reporte: Recaudación consolidada por punto de venta y forma de pago
 * Incluye también detalles de operaciones (Yape, Plin, Transferencias) con fecha, hora y número
 */
router.get(
  '/cajas/recaudacion',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { desde, hasta, punto_venta_id, forma_pago } = req.query;

      // --- Recaudación por punto de venta ---
      let pvQuery = `
        SELECT 
          pv.id,
          pv.nombre,
          COUNT(DISTINCT v.id) AS cantidad_ventas,
          SUM(v.monto) AS total_recaudado
        FROM ventas v
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        WHERE 1 = 1
      `;
      const pvParams = [];

      if (desde) {
        pvQuery += ' AND v.fecha >= ?';
        pvParams.push(desde);
      }

      if (hasta) {
        pvQuery += ' AND v.fecha <= ?';
        pvParams.push(hasta);
      }

      if (punto_venta_id) {
        pvQuery += ' AND v.punto_venta_id = ?';
        pvParams.push(punto_venta_id);
      }

      pvQuery += `
        GROUP BY pv.id, pv.nombre
        ORDER BY total_recaudado DESC
      `;

      const [recaudacionPV] = await pool.execute(pvQuery, pvParams);

      // --- Recaudación consolidada por forma de pago ---
      let pagoQuery = `
        SELECT 
          vp.forma_pago,
          COUNT(*) AS cantidad_ventas,
          SUM(vp.monto) AS monto
        FROM ventas_pagos vp
        JOIN ventas v ON vp.venta_id = v.id
        WHERE 1 = 1
      `;
      const pagoParams = [];

      if (desde) {
        pagoQuery += ' AND v.fecha >= ?';
        pagoParams.push(desde);
      }

      if (hasta) {
        pagoQuery += ' AND v.fecha <= ?';
        pagoParams.push(hasta);
      }

      if (forma_pago) {
        pagoQuery += ' AND vp.forma_pago = ?';
        pagoParams.push(forma_pago);
      }

      pagoQuery += `
        GROUP BY vp.forma_pago
        ORDER BY monto DESC
      `;

      const [recaudacionPago] = await pool.execute(pagoQuery, pagoParams);

      // --- Detalle Yape ---
      let yapeQuery = `
        SELECT 
          pv.nombre AS punto_venta,
          vp.fecha_operacion,
          vp.hora_operacion,
          vp.nro_operacion AS numero_operacion,
          vp.monto
        FROM ventas_pagos vp
        JOIN ventas v ON vp.venta_id = v.id
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        WHERE vp.forma_pago = 'Yape'
      `;
      const yapeParams = [];

      if (desde) {
        yapeQuery += ' AND v.fecha >= ?';
        yapeParams.push(desde);
      }

      if (hasta) {
        yapeQuery += ' AND v.fecha <= ?';
        yapeParams.push(hasta);
      }

      yapeQuery += ' ORDER BY vp.fecha_operacion DESC, vp.hora_operacion DESC';

      const [detalleYape] = await pool.execute(yapeQuery, yapeParams);

      // --- Detalle Plin ---
      let plinQuery = `
        SELECT 
          pv.nombre AS punto_venta,
          vp.fecha_operacion,
          vp.hora_operacion,
          vp.nro_operacion AS numero_operacion,
          vp.monto
        FROM ventas_pagos vp
        JOIN ventas v ON vp.venta_id = v.id
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        WHERE vp.forma_pago = 'Plin'
      `;
      const plinParams = [];

      if (desde) {
        plinQuery += ' AND v.fecha >= ?';
        plinParams.push(desde);
      }

      if (hasta) {
        plinQuery += ' AND v.fecha <= ?';
        plinParams.push(hasta);
      }

      plinQuery += ' ORDER BY vp.fecha_operacion DESC, vp.hora_operacion DESC';

      const [detallePlin] = await pool.execute(plinQuery, plinParams);

      // --- Detalle Transferencia ---
      let transQuery = `
        SELECT 
          pv.nombre AS punto_venta,
          vp.fecha_operacion,
          vp.hora_operacion,
          vp.nro_operacion AS numero_operacion,
          vp.monto
        FROM ventas_pagos vp
        JOIN ventas v ON vp.venta_id = v.id
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        WHERE vp.forma_pago = 'Transferencia'
      `;
      const transParams = [];

      if (desde) {
        transQuery += ' AND v.fecha >= ?';
        transParams.push(desde);
      }

      if (hasta) {
        transQuery += ' AND v.fecha <= ?';
        transParams.push(hasta);
      }

      transQuery += ' ORDER BY vp.fecha_operacion DESC, vp.hora_operacion DESC';

      const [detalleTransferencia] = await pool.execute(transQuery, transParams);

      // --- Detalle Transferencia Interbancaria ---
      let interQuery = `
        SELECT 
          pv.nombre AS punto_venta,
          vp.fecha_operacion,
          vp.hora_operacion,
          vp.nro_operacion AS numero_operacion,
          vp.monto
        FROM ventas_pagos vp
        JOIN ventas v ON vp.venta_id = v.id
        JOIN puntos_venta pv ON v.punto_venta_id = pv.id
        WHERE vp.forma_pago LIKE '%Interbancari%'
      `;
      const interParams = [];

      if (desde) {
        interQuery += ' AND v.fecha >= ?';
        interParams.push(desde);
      }

      if (hasta) {
        interQuery += ' AND v.fecha <= ?';
        interParams.push(hasta);
      }

      interQuery += ' ORDER BY vp.fecha_operacion DESC, vp.hora_operacion DESC';

      const [detalleInterbancario] = await pool.execute(interQuery, interParams);

      res.json({
        success: true,
        data: {
          por_punto_venta: recaudacionPV,
          por_forma_pago: recaudacionPago,
          detalle_yape: detalleYape,
          detalle_plin: detallePlin,
          detalle_transferencia: detalleTransferencia,
          detalle_interbancario: detalleInterbancario,
        },
      });
    } catch (error) {
      console.error('Error en reporte recaudación:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/estado
 * Reporte: Estado de cajas según disponibilidad
 */
router.get(
  '/cajas/estado',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { estado, punto_venta_id, zona_id } = req.query;

      let query = `
        SELECT 
          c.estado,
          COUNT(*) AS cantidad,
          SUM(CASE WHEN vc.monto = 40 THEN 1 ELSE 0 END) AS cajas_40,
          SUM(CASE WHEN vc.monto = 160 THEN 1 ELSE 0 END) AS cajas_160,
          SUM(COALESCE(vc.monto, 0)) AS monto_total
        FROM cajas c
        LEFT JOIN familias f ON c.familia_id = f.id
        LEFT JOIN zonas z ON f.zona_id = z.id
        LEFT JOIN ventas_cajas vc ON vc.caja_id = c.id
        WHERE 1 = 1
      `;

      const params = [];

      if (estado) {
        query += ' AND c.estado = ?';
        params.push(estado);
      }

      if (punto_venta_id) {
        query += ' AND c.punto_venta_id = ?';
        params.push(punto_venta_id);
      }

      if (zona_id) {
        query += ' AND z.id = ?';
        params.push(zona_id);
      }

      query += `
        GROUP BY c.estado
        ORDER BY cantidad DESC
      `;

      const [estados] = await pool.execute(query, params);

      res.json({
        success: true,
        data: estados,
      });
    } catch (error) {
      console.error('Error en reporte estado:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/campania-resumen
 * Reporte: Información de campaña - avance de meta
 */
router.get(
  '/cajas/campania-resumen',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const [campania] = await pool.execute('SELECT * FROM campanias LIMIT 1');

      const [totalRecaudado] = await pool.execute(
        'SELECT SUM(monto) AS total FROM ventas'
      );

      const [cajasVendidas] = await pool.execute(
        'SELECT COUNT(*) AS total FROM cajas WHERE estado = "entregada"'
      );

      const [cajasNoVendidas] = await pool.execute(
        'SELECT COUNT(*) AS total FROM cajas WHERE estado = "disponible"'
      );

      const [cajasDevueltas] = await pool.execute(
        'SELECT COUNT(*) AS total FROM cajas WHERE estado = "devuelta"'
      );

      const [cajas160] = await pool.execute(
        `
        SELECT 
          COUNT(DISTINCT c.id) AS cantidad,
          SUM(vc.monto) AS monto
        FROM ventas_cajas vc
        JOIN cajas c ON vc.caja_id = c.id
        WHERE vc.monto = 160
      `
      );

      const metaData = campania[0] || { meta_monto: 0 };
      const recaudado = totalRecaudado[0]?.total || 0;
      const porcentajeAvance =
        metaData.meta_monto > 0
          ? Math.round((recaudado / metaData.meta_monto) * 100)
          : 0;

      res.json({
        success: true,
        data: {
          campania: metaData,
          total_recaudado: recaudado,
          cajas_vendidas: cajasVendidas[0]?.total || 0,
          cajas_no_vendidas: cajasNoVendidas[0]?.total || 0,
          cajas_devueltas: cajasDevueltas[0]?.total || 0,
          cajas_160: {
            cantidad: cajas160[0]?.cantidad || 0,
            monto: cajas160[0]?.monto || 0,
          },
          porcentaje_avance: porcentajeAvance,
        },
      });
    } catch (error) {
      console.error('Error en reporte campaña:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/cajas/segmentacion-edades
 * Reporte: Segmentación por edades (Total / Vendidas / No vendidas)
 */
router.get(
  '/cajas/segmentacion-edades',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      // Totales
      let queryTotal = `
        SELECT 
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninos_0_4_total,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninas_0_4_total,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninos_5_10_total,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninas_5_10_total,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninos_11_13_total,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninas_11_13_total
        FROM integrantes_familia i
        JOIN familias f ON i.familia_id = f.id
        WHERE f.activo = 1
      `;

      const [totales] = await pool.execute(queryTotal);

      // Vendidas (caja estado = 'entregada')
      let queryVendidas = `
        SELECT 
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninos_0_4_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninas_0_4_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninos_5_10_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninas_5_10_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninos_11_13_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninas_11_13_vendidas
        FROM integrantes_familia i
        JOIN familias f ON i.familia_id = f.id
        LEFT JOIN cajas c ON c.familia_id = f.id
        WHERE f.activo = 1 
          AND c.estado = 'entregada'
      `;

      const [vendidas] = await pool.execute(queryVendidas);

      // No vendidas
      let queryNoVendidas = `
        SELECT 
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninos_0_4_no_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 0 AND 4 
            THEN 1 ELSE 0 
          END) AS ninas_0_4_no_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninos_5_10_no_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 5 AND 10 
            THEN 1 ELSE 0 
          END) AS ninas_5_10_no_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'M' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninos_11_13_no_vendidas,
          SUM(CASE 
            WHEN i.sexo = 'F' 
            AND TIMESTAMPDIFF(YEAR, i.fecha_nacimiento, NOW()) BETWEEN 11 AND 13 
            THEN 1 ELSE 0 
          END) AS ninas_11_13_no_vendidas
        FROM integrantes_familia i
        JOIN familias f ON i.familia_id = f.id
        LEFT JOIN cajas c ON c.familia_id = f.id
        WHERE f.activo = 1
          AND (
            c.id IS NULL
            OR c.estado IN ('disponible', 'asignada', 'devuelta')
          )
      `;

      const [noVendidas] = await pool.execute(queryNoVendidas);

      const totalesDefault = {
        ninos_0_4_total: 0,
        ninas_0_4_total: 0,
        ninos_5_10_total: 0,
        ninas_5_10_total: 0,
        ninos_11_13_total: 0,
        ninas_11_13_total: 0,
      };

      const vendidasDefault = {
        ninos_0_4_vendidas: 0,
        ninas_0_4_vendidas: 0,
        ninos_5_10_vendidas: 0,
        ninas_5_10_vendidas: 0,
        ninos_11_13_vendidas: 0,
        ninas_11_13_vendidas: 0,
      };

      const noVendidasDefault = {
        ninos_0_4_no_vendidas: 0,
        ninas_0_4_no_vendidas: 0,
        ninos_5_10_no_vendidas: 0,
        ninas_5_10_no_vendidas: 0,
        ninos_11_13_no_vendidas: 0,
        ninas_11_13_no_vendidas: 0,
      };

      res.json({
        success: true,
        data: {
          totales: totales[0] || totalesDefault,
          vendidas: vendidas[0] || vendidasDefault,
          no_vendidas: noVendidas[0] || noVendidasDefault,
        },
      });
    } catch (error) {
      console.error('Error en reporte segmentación por edades:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

// ==================== REPORTES SERVICIOS PARROQUIALES ====================

/**
 * GET /api/reportes/servicios/por-tipo
 * Reporte: cantidad y monto recaudado por tipo de servicio
 * Usa tablas: servicios, tipos_servicio
 */
router.get(
  '/servicios/por-tipo',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;

      let query = `
        SELECT 
          ts.id,
          ts.nombre,
          COUNT(s.id) AS cantidad,
          COALESCE(SUM(s.precio), 0) AS monto_recaudado
        FROM servicios s
        JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        WHERE 1 = 1
      `;

      const params = [];

      if (desde) {
        query += ' AND s.fecha_servicio >= ?';
        params.push(desde);
      }

      if (hasta) {
        query += ' AND s.fecha_servicio <= ?';
        params.push(hasta);
      }

      query += `
        GROUP BY ts.id, ts.nombre
        ORDER BY monto_recaudado DESC
      `;

      const [rows] = await pool.execute(query, params);

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error('Error en reporte servicios por tipo:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/servicios/ingresos
 * Reporte: ingresos por servicio (tipo), con total y promedio
 */
router.get(
  '/servicios/ingresos',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;

      let query = `
        SELECT 
          ts.id,
          ts.nombre,
          COUNT(s.id) AS cantidad_servicios,
          COALESCE(SUM(s.precio), 0) AS total_ingresos,
          CASE 
            WHEN COUNT(s.id) > 0 THEN ROUND(SUM(s.precio) / COUNT(s.id), 2)
            ELSE 0
          END AS promedio_ingreso
        FROM servicios s
        JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        WHERE 1 = 1
      `;

      const params = [];

      if (desde) {
        query += ' AND s.fecha_servicio >= ?';
        params.push(desde);
      }

      if (hasta) {
        query += ' AND s.fecha_servicio <= ?';
        params.push(hasta);
      }

      query += `
        GROUP BY ts.id, ts.nombre
        ORDER BY total_ingresos DESC
      `;

      const [rows] = await pool.execute(query, params);

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error('Error en reporte ingresos servicios:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

/**
 * GET /api/reportes/servicios/estado
 * Reporte: cantidad de servicios por estado (programado, realizado, cancelado)
 */
router.get(
  '/servicios/estado',
  authenticateToken,
  authorizePermission('reportes'),
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;

      let query = `
        SELECT 
          s.estado,
          COUNT(*) AS cantidad
        FROM servicios s
        WHERE 1 = 1
      `;

      const params = [];

      if (desde) {
        query += ' AND s.fecha_servicio >= ?';
        params.push(desde);
      }

      if (hasta) {
        query += ' AND s.fecha_servicio <= ?';
        params.push(hasta);
      }

      query += `
        GROUP BY s.estado
        ORDER BY cantidad DESC
      `;

      const [rows] = await pool.execute(query, params);

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error('Error en reporte estado servicios:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error interno del servidor' });
    }
  }
);

// 👇 Asegúrate de que esta línea quede al final
module.exports = router;
