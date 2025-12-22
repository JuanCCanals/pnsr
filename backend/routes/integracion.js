// backend/routes/integracion.js
/**
 * Rutas de integración entre Servicios Parroquiales y Venta de Cajas
 * Permite registrar servicios con venta de cajas en una sola operación
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

/**
 * POST /api/integracion/servicio-con-venta
 * Registrar un servicio parroquial con venta de cajas
 * 
 * Body:
 * {
 *   servicio: {
 *     tipo_servicio_id: number,
 *     fecha_servicio: date,
 *     descripcion: string,
 *     estado: string (programado|realizado|cancelado)
 *   },
 *   venta: {
 *     benefactor_id: number,
 *     punto_venta_id: number,
 *     cajas: [{ caja_id: number, monto: number }],
 *     monto_total: number,
 *     forma_pago: string (efectivo|tarjeta|transferencia),
 *     numero_comprobante: string
 *   },
 *   cobro: {
 *     monto: number,
 *     forma_pago: string,
 *     referencia: string
 *   }
 * }
 */
router.post('/servicio-con-venta', authenticateToken, authorizePermission(['servicios', 'venta_cajas']), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { servicio, venta, cobro } = req.body;

    // Validaciones
    if (!servicio || !venta) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren datos de servicio y venta'
      });
    }

    // 1. Crear servicio parroquial
    const [servicioResult] = await connection.execute(
      `INSERT INTO servicios (tipo_servicio_id, fecha_servicio, descripcion, estado, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        servicio.tipo_servicio_id,
        servicio.fecha_servicio,
        servicio.descripcion || null,
        servicio.estado || 'programado',
        req.user.id
      ]
    );

    const servicioId = servicioResult.insertId;

    // 2. Crear venta de cajas
    const [ventaResult] = await connection.execute(
      `INSERT INTO ventas (benefactor_id, punto_venta_id, monto_total, forma_pago, numero_comprobante, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        venta.benefactor_id,
        venta.punto_venta_id,
        venta.monto_total,
        venta.forma_pago,
        venta.numero_comprobante || null,
        req.user.id
      ]
    );

    const ventaId = ventaResult.insertId;

    // 3. Registrar cajas vendidas
    if (venta.cajas && Array.isArray(venta.cajas)) {
      for (let caja of venta.cajas) {
        // Insertar venta_caja
        await connection.execute(
          `INSERT INTO ventas_cajas (venta_id, caja_id, monto, estado)
           VALUES (?, ?, ?, 'vendida')`,
          [ventaId, caja.caja_id, caja.monto]
        );

        // Actualizar estado de la caja
        await connection.execute(
          `UPDATE cajas SET estado = 'vendida' WHERE id = ?`,
          [caja.caja_id]
        );
      }
    }

    // 4. Registrar cobro si se proporciona
    if (cobro && cobro.monto > 0) {
      await connection.execute(
        `INSERT INTO cobros (servicio_id, monto, forma_pago, referencia, usuario_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          servicioId,
          cobro.monto,
          cobro.forma_pago || venta.forma_pago,
          cobro.referencia || null,
          req.user.id
        ]
      );
    }

    // 5. Registrar ingresos
    await connection.execute(
      `INSERT INTO ingresos (tipo, monto, referencia, usuario_id)
       VALUES (?, ?, ?, ?)`,
      [
        'venta_cajas',
        venta.monto_total,
        `Venta cajas - Servicio ${servicioId}`,
        req.user.id
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        servicio_id: servicioId,
        venta_id: ventaId,
        monto_total: venta.monto_total
      },
      message: 'Servicio y venta registrados exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error en integración:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar servicio y venta'
    });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/integracion/servicio-con-donacion
 * Registrar un servicio parroquial con donación de cajas
 * (cuando no se vende, se dona)
 */
router.post('/servicio-con-donacion', authenticateToken, authorizePermission(['servicios', 'venta_cajas']), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { servicio, cajas, donante, observaciones } = req.body;

    // Validaciones
    if (!servicio || !cajas || cajas.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren datos de servicio y cajas'
      });
    }

    // 1. Crear servicio parroquial
    const [servicioResult] = await connection.execute(
      `INSERT INTO servicios (tipo_servicio_id, fecha_servicio, descripcion, estado, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        servicio.tipo_servicio_id,
        servicio.fecha_servicio,
        observaciones || null,
        servicio.estado || 'realizado',
        req.user.id
      ]
    );

    const servicioId = servicioResult.insertId;

    // 2. Registrar cajas donadas
    let totalCajas = 0;
    let totalMonto = 0;

    for (let caja of cajas) {
      // Actualizar estado de la caja
      await connection.execute(
        `UPDATE cajas SET estado = 'donada' WHERE id = ?`,
        [caja.caja_id]
      );

      totalCajas++;
      totalMonto += caja.monto || 0;
    }

    // 3. Registrar donación como ingreso
    await connection.execute(
      `INSERT INTO ingresos (tipo, monto, referencia, usuario_id)
       VALUES (?, ?, ?, ?)`,
      [
        'donacion_cajas',
        totalMonto,
        `Donación cajas - Servicio ${servicioId} - Donante: ${donante || 'Anónimo'}`,
        req.user.id
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        servicio_id: servicioId,
        cajas_donadas: totalCajas,
        monto_donado: totalMonto
      },
      message: 'Servicio y donación registrados exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error en integración donación:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar servicio y donación'
    });
  } finally {
    connection.release();
  }
});

/**
 * GET /api/integracion/servicios-con-ventas
 * Obtener listado de servicios con sus ventas asociadas
 */
router.get('/servicios-con-ventas', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const { desde, hasta, tipo_servicio_id } = req.query;

    let query = `
      SELECT 
        s.id as servicio_id,
        s.fecha_servicio,
        ts.nombre as tipo_servicio,
        s.estado as estado_servicio,
        COUNT(DISTINCT v.id) as cantidad_ventas,
        SUM(v.monto_total) as monto_total_venta,
        SUM(COALESCE(c.monto, 0)) as monto_cobrado,
        GROUP_CONCAT(DISTINCT b.nombre SEPARATOR ', ') as benefactores
      FROM servicios s
      JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
      LEFT JOIN ventas v ON s.id = v.servicio_id
      LEFT JOIN cobros c ON s.id = c.servicio_id
      LEFT JOIN benefactores b ON v.benefactor_id = b.id
      WHERE 1=1
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

    if (tipo_servicio_id) {
      query += ' AND s.tipo_servicio_id = ?';
      params.push(tipo_servicio_id);
    }

    query += ' GROUP BY s.id ORDER BY s.fecha_servicio DESC';

    const [servicios] = await pool.execute(query, params);

    res.json({
      success: true,
      data: servicios,
      total: servicios.length
    });
  } catch (error) {
    console.error('Error al obtener servicios con ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/integracion/resumen-integracion
 * Obtener resumen de integración entre servicios y ventas
 */
router.get('/resumen-integracion', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    // Servicios con ventas
    const [serviciosConVentas] = await pool.execute(`
      SELECT COUNT(DISTINCT s.id) as cantidad
      FROM servicios s
      JOIN ventas v ON s.id = v.servicio_id
    `);

    // Total monto vendido en servicios
    const [montoVendido] = await pool.execute(`
      SELECT SUM(v.monto_total) as total
      FROM servicios s
      JOIN ventas v ON s.id = v.servicio_id
    `);

    // Servicios sin venta
    const [serviciosSinVenta] = await pool.execute(`
      SELECT COUNT(*) as cantidad
      FROM servicios s
      WHERE s.id NOT IN (SELECT DISTINCT servicio_id FROM ventas WHERE servicio_id IS NOT NULL)
    `);

    // Cajas vendidas en servicios
    const [cajasVendidas] = await pool.execute(`
      SELECT COUNT(DISTINCT vc.caja_id) as cantidad
      FROM servicios s
      JOIN ventas v ON s.id = v.servicio_id
      JOIN ventas_cajas vc ON v.id = vc.venta_id
    `);

    // Promedio de cajas por servicio
    const [promedioCajas] = await pool.execute(`
      SELECT AVG(cantidad_cajas) as promedio
      FROM (
        SELECT COUNT(vc.id) as cantidad_cajas
        FROM servicios s
        JOIN ventas v ON s.id = v.servicio_id
        JOIN ventas_cajas vc ON v.id = vc.venta_id
        GROUP BY s.id
      ) as subquery
    `);

    res.json({
      success: true,
      data: {
        servicios_con_ventas: serviciosConVentas[0]?.cantidad || 0,
        monto_total_vendido: montoVendido[0]?.total || 0,
        servicios_sin_venta: serviciosSinVenta[0]?.cantidad || 0,
        cajas_vendidas: cajasVendidas[0]?.cantidad || 0,
        promedio_cajas_por_servicio: Math.round(promedioCajas[0]?.promedio || 0)
      }
    });
  } catch (error) {
    console.error('Error en resumen integración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;
