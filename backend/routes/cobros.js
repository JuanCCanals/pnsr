// backend/routes/cobros.js
/**
 * Rutas para gestión de cobros con soporte de pagos múltiples
 * y generación de tickets con correlativos
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const PDFDocument = require('pdfkit');

// ===================================================================
// FUNCIONES AUXILIARES
// ===================================================================

/**
 * Generar correlativo para serie
 */
async function generarCorrelativo(serie = 'T001') {
  const [rows] = await pool.execute(`
    SELECT MAX(correlativo) as max_correlativo
    FROM comprobantes
    WHERE serie = ?
  `, [serie]);
  
  const siguiente = (rows[0]?.max_correlativo || 0) + 1;
  return siguiente;
}

/**
 * Asegurar cliente (busca por DNI o crea nuevo)
 */
async function ensureCliente(connection, nombre, dni = '') {
  const nom = String(nombre).trim();
  const doc = String(dni || '').trim();

  if (!nom) throw new Error('Nombre requerido');
  if (nom.length > 100) throw new Error('Nombre demasiado largo');
  if (doc && !/^\d{8}$/.test(doc)) {
    throw new Error('DNI inválido (8 dígitos)');
  }

  // 1) Si viene DNI, buscar por DNI
  if (doc) {
    const [r1] = await connection.query('SELECT id FROM clientes WHERE dni = ? LIMIT 1', [doc]);
    if (r1.length) return r1[0].id;
  }

  // 2) Buscar por nombre exacto
  const [r2] = await connection.query('SELECT id FROM clientes WHERE nombre = ? LIMIT 1', [nom]);
  if (r2.length) return r2[0].id;

  // 3) Crear nuevo
  try {
    const [ins] = await connection.execute(
      'INSERT INTO clientes (nombre, dni, activo) VALUES (?, ?, 1)',
      [nom, doc || null]
    );
    return ins.insertId;
  } catch (e) {
    // Si chocó por DNI duplicado, devolver el existente
    if (e && e.code === 'ER_DUP_ENTRY' && doc) {
      const [r3] = await connection.query('SELECT id FROM clientes WHERE dni = ? LIMIT 1', [doc]);
      if (r3.length) return r3[0].id;
    }
    throw new Error('No se pudo asegurar cliente');
  }
}

// ===================================================================
// ENDPOINTS
// ===================================================================

/**
 * POST /api/cobros/ensure-cliente
 * Asegurar cliente por nombre/dni y devolver su id
 */
router.post('/ensure-cliente', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { nombre = '', dni = '' } = req.body || {};
    const cliente_id = await ensureCliente(connection, nombre, dni);
    res.json({ success: true, data: { id: cliente_id } });
  } catch (error) {
    console.error('ensure-cliente:', error);
    res.status(500).json({ success: false, error: error.message || 'No se pudo asegurar cliente' });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/cobros
 * Crear cobro con soporte de pagos múltiples
 */
router.post('/', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { 
      servicio_id = null, 
      caja_id = null, 
      cliente_nombre,
      cliente_dni = '',
      concepto, 
      monto, 
      pagos = [], // Array de { metodo_pago_id, monto }
      observaciones = null 
    } = req.body;

    // Validaciones básicas
    if (!cliente_nombre || !concepto || !monto) {
      throw new Error('cliente_nombre, concepto y monto son obligatorios');
    }

    if (!servicio_id && !caja_id) {
      throw new Error('Debe indicar servicio_id o caja_id');
    }

    if (!Array.isArray(pagos) || pagos.length === 0) {
      throw new Error('Debe proporcionar al menos una forma de pago');
    }

    // Validar suma de pagos
    const sumaPagos = pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    const totalEsperado = parseFloat(monto);
    
    if (Math.abs(sumaPagos - totalEsperado) > 0.01) {
      throw new Error(`La suma de los pagos (${sumaPagos}) no coincide con el total (${totalEsperado})`);
    }

    // Asegurar cliente
    const cliente_id = await ensureCliente(connection, cliente_nombre, cliente_dni);

    // Generar serie y correlativo
    const serie = 'T001'; // Puedes hacerlo configurable
    const correlativo = await generarCorrelativo(serie);
    const numero_comprobante = `${serie}-${String(correlativo).padStart(8, '0')}`;

    // Crear cobro
    const [resultCobro] = await connection.execute(`
      INSERT INTO cobros (
        servicio_id, 
        caja_id, 
        cliente_id, 
        concepto, 
        monto, 
        numero_comprobante,
        observaciones, 
        usuario_id,
        fecha_cobro
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        servicio_id, 
        caja_id, 
        cliente_id, 
        concepto, 
        monto, 
        numero_comprobante,
        observaciones, 
        req.user?.id || 1
      ]
    );

    const cobro_id = resultCobro.insertId;

    // Crear pagos (múltiples)
    for (const pago of pagos) {
      if (!pago.metodo_pago_id || !pago.monto) {
        throw new Error('Cada pago debe tener metodo_pago_id y monto');
      }

      await connection.execute(`
        INSERT INTO cobros_pagos (cobro_id, metodo_pago_id, monto)
        VALUES (?, ?, ?)
      `, [cobro_id, pago.metodo_pago_id, pago.monto]);
    }

    // Crear comprobante
    const [resultComprobante] = await connection.execute(`
      INSERT INTO comprobantes (cobro_id, serie, correlativo, numero, tipo)
      VALUES (?, ?, ?, ?, 'recibo')
    `, [cobro_id, serie, correlativo, numero_comprobante]);

    await connection.commit();

    res.status(201).json({ 
      success: true, 
      data: { 
        cobro_id,
        comprobante_id: resultComprobante.insertId,
        numero_comprobante 
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creando cobro:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Error interno al crear cobro' 
    });
  } finally {
    connection.release();
  }
});

/**
 * GET /api/cobros/:id
 * Obtener cobro por ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.query(`
      SELECT 
        co.*, 
        cl.nombre AS cliente_nombre, 
        cl.dni AS cliente_dni,
        comp.serie,
        comp.correlativo,
        comp.numero as numero_comprobante
      FROM cobros co
      JOIN clientes cl ON co.cliente_id = cl.id
      LEFT JOIN comprobantes comp ON comp.cobro_id = co.id
      WHERE co.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Cobro no encontrado' });
    }

    // Obtener pagos del cobro
    const [pagos] = await pool.query(`
      SELECT 
        cp.id,
        cp.monto,
        mp.nombre as metodo_pago
      FROM cobros_pagos cp
      JOIN metodos_pago mp ON cp.metodo_pago_id = mp.id
      WHERE cp.cobro_id = ?
    `, [id]);

    const cobro = rows[0];
    cobro.pagos = pagos;

    res.json({ success: true, data: cobro });
  } catch (error) {
    console.error('Error obteniendo cobro:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

/**
 * GET /api/cobros/:id/ticket
 * Generar ticket PDF 80mm según modelo
 */
router.get('/:id/ticket', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { hideCliente = '1' } = req.query;

    // Obtener cobro con todos los datos
    const [rows] = await pool.query(`
      SELECT 
        co.*, 
        cl.nombre as cliente_nombre, 
        cl.dni as cliente_dni,
        comp.serie,
        comp.correlativo,
        comp.numero as numero_comprobante,
        s.tipo_servicio_id,
        ts.nombre as tipo_servicio_nombre
      FROM cobros co
      JOIN clientes cl ON co.cliente_id = cl.id
      JOIN comprobantes comp ON comp.cobro_id = co.id
      LEFT JOIN servicios s ON co.servicio_id = s.id
      LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
      WHERE co.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Cobro no encontrado' });
    }

    const cobro = rows[0];

    // Obtener pagos
    const [pagos] = await pool.query(`
      SELECT cp.monto, mp.nombre as metodo
      FROM cobros_pagos cp
      JOIN metodos_pago mp ON cp.metodo_pago_id = mp.id
      WHERE cp.cobro_id = ?
    `, [id]);

    // Obtener texto footer de configuración
    const [config] = await pool.query(`
      SELECT valor FROM configuracion_sistema WHERE clave = 'ticket_footer_text'
    `);
    const footerText = config[0]?.valor || 'Gracias por su preferencia';

    // Generar PDF (80mm = 226.77pt)
    const doc = new PDFDocument({ 
      size: [226.77, 600], 
      margins: { top: 10, bottom: 10, left: 10, right: 10 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ticket_${cobro.numero_comprobante}.pdf`);
    doc.pipe(res);

    // === HEADER ===
    doc.fontSize(11).text('PARROQUIA N.S. DE LA RECONCILIACIÓN', { align: 'center' });
    doc.fontSize(8).text('CABILDO METROPOLITANO DE LIMA - RUC: 20177176771', { align: 'center' });
    doc.fontSize(8).text('JR.CARABAYA S/N, PLAZA DE ARMAS DE LIMA - LIMA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Nº TICKET: ${cobro.numero_comprobante}`, { align: 'center' });
    doc.moveDown(0.3);

    // Fecha y hora
    const fecha = new Date(cobro.fecha_cobro || Date.now());
    doc.fontSize(8).text(
      `FECHA: ${fecha.toLocaleDateString('es-PE')}   HORA: ${fecha.toLocaleTimeString('es-PE')}`, 
      { align: 'center' }
    );
    doc.moveDown(0.5);

    // === ITEMS ===
    doc.fontSize(8);
    const yItems = doc.y;
    doc.text('ITEM', 10, yItems);
    doc.text('CANT', 130, yItems);
    doc.text('P.UNIT', 165, yItems);
    doc.text('SUBTOTAL', 190, yItems);
    doc.moveDown(0.3);
    doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
    doc.moveDown(0.2);

    // Item único
    const yItem = doc.y;
    doc.text(cobro.concepto || 'Servicio', 10, yItem, { width: 110 });
    doc.text('1', 130, yItem);
    doc.text(`S/ ${Number(cobro.monto).toFixed(2)}`, 165, yItem);
    doc.text(`S/ ${Number(cobro.monto).toFixed(2)}`, 190, yItem);

    doc.moveDown(1);

    // === PAGOS ===
    pagos.forEach(pago => {
      doc.fontSize(8).text(`${pago.metodo}: S/ ${Number(pago.monto).toFixed(2)}`, { align: 'left' });
    });

    doc.moveDown(0.5);
    doc.fontSize(11).text(`TOTAL: S/ ${Number(cobro.monto).toFixed(2)}`, { align: 'right' });
    
    // Cliente (opcional)
    const mostrarCliente = hideCliente !== '1';
    if (mostrarCliente && cobro.cliente_nombre) {
      doc.moveDown(0.3);
      doc.fontSize(8).text(
        `CLIENTE: ${cobro.cliente_nombre}${cobro.cliente_dni ? ' (DNI ' + cobro.cliente_dni + ')' : ''}`, 
        { align: 'left' }
      );
    }

    // === FOOTER ===
    doc.moveDown(1);
    doc.fontSize(7).text(footerText, { align: 'center', width: 206 });

    doc.end();

  } catch (error) {
    console.error('Error generando ticket:', error);
    res.status(500).json({ success: false, error: 'No se pudo generar el ticket' });
  }
});

module.exports = router;
