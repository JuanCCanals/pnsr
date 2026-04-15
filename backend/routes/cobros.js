// backend/routes/cobros.js
/**
 * Rutas para gestión de cobros con soporte de pagos múltiples
 * y generación de tickets con correlativos
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Ruta absoluta al logo PNSR (para cabecera del ticket PDF)
const LOGO_PATH = path.join(__dirname, '..', '..', 'logos', 'Logo-PNSR-Web1.png');

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
async function ensureCliente(connection, nombre, dni = '', telefono = '', email = '') {
  const nom = String(nombre).trim();
  const doc = String(dni || '').trim();
  const tel = String(telefono || '').trim();
  const mail = String(email || '').trim();

  if (!nom) throw new Error('Nombre requerido');
  if (nom.length > 100) throw new Error('Nombre demasiado largo');
  if (doc && !/^\d{8}$/.test(doc)) {
    throw new Error('El DNI debe tener exactamente 8 dígitos numéricos');
  }

  // 1) Si viene DNI, buscar por DNI
  if (doc) {
    const [r1] = await connection.query('SELECT id FROM clientes WHERE dni = ? LIMIT 1', [doc]);
    if (r1.length) {
      // Actualizar telefono/email si vienen
      if (tel || mail) {
        const sets = []; const vals = [];
        if (tel) { sets.push('telefono = ?'); vals.push(tel); }
        if (mail) { sets.push('email = ?'); vals.push(mail); }
        if (sets.length) {
          vals.push(r1[0].id);
          await connection.execute(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`, vals);
        }
      }
      return r1[0].id;
    }
  }

  // 2) Buscar por nombre exacto
  const [r2] = await connection.query('SELECT id FROM clientes WHERE nombre = ? LIMIT 1', [nom]);
  if (r2.length) {
    // Actualizar telefono/email si vienen
    if (tel || mail) {
      const sets = []; const vals = [];
      if (tel) { sets.push('telefono = ?'); vals.push(tel); }
      if (mail) { sets.push('email = ?'); vals.push(mail); }
      if (sets.length) {
        vals.push(r2[0].id);
        await connection.execute(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`, vals);
      }
    }
    return r2[0].id;
  }

  // 3) Crear nuevo
  try {
    const [ins] = await connection.execute(
      'INSERT INTO clientes (nombre, dni, telefono, email, activo) VALUES (?, ?, ?, ?, 1)',
      [nom, doc || null, tel || null, mail || null]
    );
    return ins.insertId;
  } catch (e) {
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
 * GET /api/cobros/consultar-dni/:dni
 * Proxy para consultar DNI en apis.net.pe (evita CORS del navegador)
 */
router.get('/consultar-dni/:dni', authenticateToken, async (req, res) => {
  try {
    const { dni } = req.params;
    const proveedor = req.query.proveedor || 'apisnetpe';

    if (!/^\d{8}$/.test(dni)) {
      return res.status(400).json({ success: false, error: 'DNI debe tener 8 dígitos' });
    }

    let url, headers;

    if (proveedor === 'apisnetpe') {
      const token = process.env.APISNETPE_TOKEN || 'apis-token-5978.vALeomBsDdA-LujBZkqcczBrKxI1CBp6';
      url = `https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`;
      headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/json' };
    } else {
      return res.status(400).json({ success: false, error: 'Proveedor no soportado en proxy' });
    }

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Error ${response.status} desde API externa` });
    }

    const data = await response.json();
    const nombres = data.nombres || '';
    const apPat = data.apellidoPaterno || '';
    const apMat = data.apellidoMaterno || '';

    res.json({
      success: true,
      data: {
        dni: data.dni || dni,
        nombres,
        apellidoPaterno: apPat,
        apellidoMaterno: apMat,
        nombreCompleto: `${nombres} ${apPat} ${apMat}`.trim()
      }
    });
  } catch (error) {
    console.error('Proxy consultar-dni:', error);
    res.status(500).json({ success: false, error: error.message || 'Error consultando DNI' });
  }
});

/**
 * POST /api/cobros/ensure-cliente
 * Asegurar cliente por nombre/dni y devolver su id
 */
router.post('/ensure-cliente', authenticateToken, authorizePermission('registrar-servicios.crear'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { nombre = '', dni = '', telefono = '', email = '' } = req.body || {};
    const cliente_id = await ensureCliente(connection, nombre, dni, telefono, email);
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
router.post('/', authenticateToken, authorizePermission('registrar-servicios.crear'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      servicio_id = null,
      caja_id = null,
      cliente_nombre,
      cliente_dni = '',
      cliente_telefono = '',
      cliente_email = '',
      concepto: conceptoBody,
      monto: montoBody,
      pagos = [],
      items = [],
      observaciones = null,
      estado = 'programado'
    } = req.body;

    const hasItems = Array.isArray(items) && items.length > 0;
    const ESTADOS_VALIDOS = ['programado', 'realizado', 'cancelado'];
    const estadoFinal = ESTADOS_VALIDOS.includes(estado) ? estado : 'programado';

    // Validaciones básicas con mensajes claros
    if (!cliente_nombre || !String(cliente_nombre).trim()) {
      throw new Error('El nombre del cliente es obligatorio');
    }

    if (!hasItems) {
      // Legacy flow: concepto y monto obligatorios
      if (!conceptoBody || !String(conceptoBody).trim()) {
        throw new Error('El concepto es obligatorio');
      }
      if (!montoBody || Number(montoBody) <= 0) {
        throw new Error('El monto debe ser mayor a 0');
      }
      if (!servicio_id && !caja_id) {
        throw new Error('Debe indicar servicio_id o caja_id');
      }
    } else {
      // Multi-item flow: validar cada item
      for (const item of items) {
        if (!item.tipo_servicio_id) throw new Error('Cada servicio debe tener un tipo de servicio');
        if (!item.precio || Number(item.precio) <= 0) throw new Error('Cada servicio debe tener un precio mayor a 0');
      }
    }

    if (!Array.isArray(pagos) || pagos.length === 0) {
      throw new Error('Debe seleccionar al menos una forma de pago');
    }

    // Calcular monto y concepto según flujo
    let concepto, monto;

    if (hasItems) {
      // Obtener nombres de tipos_servicio para el concepto
      const tipoIds = [...new Set(items.map(i => i.tipo_servicio_id))];
      const placeholders = tipoIds.map(() => '?').join(',');
      const [tiposRows] = await connection.query(
        `SELECT id, nombre FROM tipos_servicio WHERE id IN (${placeholders})`,
        tipoIds
      );
      const tiposMap = {};
      tiposRows.forEach(t => { tiposMap[t.id] = t.nombre; });

      monto = items.reduce((sum, i) => sum + parseFloat(i.precio || 0), 0);
      const labels = items.map(i => tiposMap[i.tipo_servicio_id] || 'Servicio');
      concepto = labels.join(' + ');
    } else {
      concepto = conceptoBody;
      monto = montoBody;
    }

    // Validar suma de pagos
    const sumaPagos = pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    const totalEsperado = parseFloat(monto);

    if (Math.abs(sumaPagos - totalEsperado) > 0.01) {
      throw new Error(`La suma de los pagos (S/ ${sumaPagos.toFixed(2)}) no coincide con el total del servicio (S/ ${totalEsperado.toFixed(2)}). Por favor ajuste los montos.`);
    }

    // Asegurar cliente
    const cliente_id = await ensureCliente(connection, cliente_nombre, cliente_dni, cliente_telefono, cliente_email);

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
        hasItems ? null : servicio_id,
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

    // Safeguard: limpiar rows huérfanas de cobro_servicios que pudieran existir
    // con este cobro_id (puede pasar si se purgó cobros sin purgar cobro_servicios)
    await connection.execute(`DELETE FROM cobro_servicios WHERE cobro_id = ?`, [cobro_id]);

    // Insertar items en cobro_servicios
    if (hasItems) {
      // Obtener nombres de tipos_servicio (ya tenemos tiposMap del cálculo anterior,
      // pero lo reconstruimos aquí por seguridad de scope)
      const tipoIds2 = [...new Set(items.map(i => i.tipo_servicio_id))];
      const ph2 = tipoIds2.map(() => '?').join(',');
      const [tiposRows2] = await connection.query(
        `SELECT id, nombre FROM tipos_servicio WHERE id IN (${ph2})`,
        tipoIds2
      );
      const tiposMap2 = {};
      tiposRows2.forEach(t => { tiposMap2[t.id] = t.nombre; });

      for (const item of items) {
        // Crear servicio individual
        const [svcResult] = await connection.execute(
          `INSERT INTO servicios (cliente_id, tipo_servicio_id, fecha_servicio, hora_servicio, precio, observaciones, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            cliente_id,
            item.tipo_servicio_id,
            item.fecha_servicio || null,
            item.hora_servicio || null,
            item.precio,
            item.observaciones || null,
            estadoFinal
          ]
        );
        const newServicioId = svcResult.insertId;
        const itemConcepto = tiposMap2[item.tipo_servicio_id] || 'Servicio';

        // Insertar en cobro_servicios
        await connection.execute(
          `INSERT INTO cobro_servicios (cobro_id, servicio_id, concepto, cantidad, precio_unitario, subtotal)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [cobro_id, newServicioId, itemConcepto, item.precio, item.precio]
        );
      }
    } else if (servicio_id) {
      // Legacy flow con servicio_id: insertar también en cobro_servicios para consistencia
      await connection.execute(
        `INSERT INTO cobro_servicios (cobro_id, servicio_id, concepto, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, 1, ?, ?)`,
        [cobro_id, servicio_id, concepto, monto, monto]
      );
    }

    // Crear pagos (múltiples)
    for (const pago of pagos) {
      if (!pago.metodo_pago_id || !pago.monto) {
        throw new Error('Cada forma de pago debe tener un método seleccionado y un monto válido');
      }

      await connection.execute(`
        INSERT INTO cobros_pagos (cobro_id, metodo_pago_id, monto, fecha_operacion, hora_operacion, nro_operacion, obs_operacion)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [cobro_id, pago.metodo_pago_id, pago.monto,
          pago.fecha_operacion || null, pago.hora_operacion || null,
          pago.nro_operacion || null, pago.obs_operacion || null]);
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
 * PUT /api/cobros/:id
 * Actualizar cobro existente (concepto, monto, observaciones) y reemplazar pagos.
 * NO regenera el comprobante (se mantiene la serie/correlativo ya emitidos).
 */
router.put('/:id', authenticateToken, authorizePermission('registrar-servicios.actualizar'), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      cliente_nombre,
      cliente_dni = '',
      cliente_telefono = '',
      cliente_email = '',
      concepto: conceptoBody,
      monto: montoBody,
      pagos = [],
      items = [], // Array de { tipo_servicio_id, fecha_servicio, hora_servicio, precio, observaciones }
      observaciones = null,
      estado = 'programado'
    } = req.body;

    const hasItems = Array.isArray(items) && items.length > 0;
    const ESTADOS_VALIDOS = ['programado', 'realizado', 'cancelado'];
    const estadoFinal = ESTADOS_VALIDOS.includes(estado) ? estado : 'programado';

    // Verificar que el cobro exista
    const [existRows] = await connection.query('SELECT id, cliente_id FROM cobros WHERE id = ?', [id]);
    if (!existRows.length) {
      throw new Error('Cobro no encontrado');
    }

    // Validaciones
    if (!cliente_nombre || !String(cliente_nombre).trim()) {
      throw new Error('El nombre del cliente es obligatorio');
    }

    if (!hasItems) {
      if (!conceptoBody || !String(conceptoBody).trim()) {
        throw new Error('El concepto es obligatorio');
      }
      if (!montoBody || Number(montoBody) <= 0) {
        throw new Error('El monto debe ser mayor a 0');
      }
    } else {
      for (const item of items) {
        if (!item.tipo_servicio_id) throw new Error('Cada servicio debe tener un tipo de servicio');
        if (!item.precio || Number(item.precio) <= 0) throw new Error('Cada servicio debe tener un precio mayor a 0');
      }
    }

    if (!Array.isArray(pagos) || pagos.length === 0) {
      throw new Error('Debe seleccionar al menos una forma de pago');
    }

    // Calcular monto y concepto según flujo
    let concepto, monto;

    if (hasItems) {
      const tipoIds = [...new Set(items.map(i => i.tipo_servicio_id))];
      const placeholders = tipoIds.map(() => '?').join(',');
      const [tiposRows] = await connection.query(
        `SELECT id, nombre FROM tipos_servicio WHERE id IN (${placeholders})`,
        tipoIds
      );
      const tiposMap = {};
      tiposRows.forEach(t => { tiposMap[t.id] = t.nombre; });

      monto = items.reduce((sum, i) => sum + parseFloat(i.precio || 0), 0);
      const labels = items.map(i => tiposMap[i.tipo_servicio_id] || 'Servicio');
      concepto = labels.join(' + ');
    } else {
      concepto = conceptoBody;
      monto = montoBody;
    }

    const sumaPagos = pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    const totalEsperado = parseFloat(monto);
    if (Math.abs(sumaPagos - totalEsperado) > 0.01) {
      throw new Error(`La suma de los pagos (S/ ${sumaPagos.toFixed(2)}) no coincide con el total (S/ ${totalEsperado.toFixed(2)}).`);
    }

    // Actualizar / asegurar cliente (usa DNI como llave natural si existe)
    const cliente_id = await ensureCliente(connection, cliente_nombre, cliente_dni, cliente_telefono, cliente_email);

    // Manejar items de cobro_servicios
    if (hasItems) {
      // Obtener servicios anteriores vinculados a este cobro via cobro_servicios
      const [oldItems] = await connection.query(
        `SELECT servicio_id FROM cobro_servicios WHERE cobro_id = ?`,
        [id]
      );
      const oldServicioIds = oldItems.map(r => r.servicio_id).filter(Boolean);

      // Eliminar registros anteriores de cobro_servicios
      await connection.execute(`DELETE FROM cobro_servicios WHERE cobro_id = ?`, [id]);

      // Eliminar servicios que fueron creados por este cobro
      if (oldServicioIds.length > 0) {
        const phDel = oldServicioIds.map(() => '?').join(',');
        await connection.execute(
          `DELETE FROM servicios WHERE id IN (${phDel})`,
          oldServicioIds
        );
      }

      // Obtener nombres de tipos_servicio
      const tipoIds2 = [...new Set(items.map(i => i.tipo_servicio_id))];
      const ph2 = tipoIds2.map(() => '?').join(',');
      const [tiposRows2] = await connection.query(
        `SELECT id, nombre FROM tipos_servicio WHERE id IN (${ph2})`,
        tipoIds2
      );
      const tiposMap2 = {};
      tiposRows2.forEach(t => { tiposMap2[t.id] = t.nombre; });

      // Crear nuevos servicios e insertar en cobro_servicios
      for (const item of items) {
        const [svcResult] = await connection.execute(
          `INSERT INTO servicios (cliente_id, tipo_servicio_id, fecha_servicio, hora_servicio, precio, observaciones, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            cliente_id,
            item.tipo_servicio_id,
            item.fecha_servicio || null,
            item.hora_servicio || null,
            item.precio,
            item.observaciones || null,
            estadoFinal
          ]
        );
        const newServicioId = svcResult.insertId;
        const itemConcepto = tiposMap2[item.tipo_servicio_id] || 'Servicio';

        await connection.execute(
          `INSERT INTO cobro_servicios (cobro_id, servicio_id, concepto, cantidad, precio_unitario, subtotal)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [id, newServicioId, itemConcepto, item.precio, item.precio]
        );
      }

      // Actualizar cobro (servicio_id = NULL para multi-item)
      await connection.execute(
        `UPDATE cobros SET cliente_id = ?, servicio_id = NULL, concepto = ?, monto = ?, observaciones = ? WHERE id = ?`,
        [cliente_id, concepto, monto, observaciones, id]
      );
    } else {
      // Legacy flow: solo actualizar concepto/monto
      await connection.execute(
        `UPDATE cobros SET cliente_id = ?, concepto = ?, monto = ?, observaciones = ? WHERE id = ?`,
        [cliente_id, concepto, monto, observaciones, id]
      );
    }

    // Reemplazar pagos: borrar los existentes y reinsertar
    await connection.execute(`DELETE FROM cobros_pagos WHERE cobro_id = ?`, [id]);

    for (const pago of pagos) {
      if (!pago.metodo_pago_id || !pago.monto) {
        throw new Error('Cada forma de pago debe tener un método seleccionado y un monto válido');
      }
      await connection.execute(
        `INSERT INTO cobros_pagos (cobro_id, metodo_pago_id, monto, fecha_operacion, hora_operacion, nro_operacion, obs_operacion)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, pago.metodo_pago_id, pago.monto,
         pago.fecha_operacion || null, pago.hora_operacion || null,
         pago.nro_operacion || null, pago.obs_operacion || null]
      );
    }

    await connection.commit();

    res.json({ success: true, data: { cobro_id: Number(id) } });
  } catch (error) {
    await connection.rollback();
    console.error('Error actualizando cobro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error interno al actualizar cobro'
    });
  } finally {
    connection.release();
  }
});

/**
 * GET /api/cobros/:id
 * Obtener cobro por ID
 */
router.get('/:id', authenticateToken, authorizePermission('registrar-servicios.leer'), async (req, res) => {
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

    // Obtener pagos del cobro (incluye metodo_pago_id + datos de operación por pago)
    const [pagos] = await pool.query(`
      SELECT
        cp.id,
        cp.metodo_pago_id,
        cp.monto,
        cp.fecha_operacion,
        cp.hora_operacion,
        cp.nro_operacion,
        cp.obs_operacion,
        mp.nombre as metodo_pago
      FROM cobros_pagos cp
      JOIN metodos_pago mp ON cp.metodo_pago_id = mp.id
      WHERE cp.cobro_id = ?
    `, [id]);

    const cobro = rows[0];
    cobro.pagos = pagos;

    // Obtener items de cobro_servicios
    const [items] = await pool.query(`
      SELECT cs.id, cs.servicio_id, cs.concepto, cs.cantidad, cs.precio_unitario, cs.subtotal,
             s.tipo_servicio_id, s.fecha_servicio, s.hora_servicio
      FROM cobro_servicios cs
      LEFT JOIN servicios s ON cs.servicio_id = s.id
      WHERE cs.cobro_id = ?
    `, [id]);
    cobro.items = items;

    res.json({ success: true, data: cobro });
  } catch (error) {
    console.error('Error obteniendo cobro:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

/**
 * GET /api/cobros/:id/ticket
 * Generar ticket PDF 80mm — diseño profesional con QR
 */
router.get('/:id/ticket', authenticateToken, authorizePermission('registrar-servicios.leer'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener cobro con todos los datos
    const [rows] = await pool.query(`
      SELECT 
        co.*, 
        cl.nombre as cliente_nombre, 
        cl.dni as cliente_dni,
        cl.telefono as cliente_telefono,
        comp.serie,
        comp.correlativo,
        comp.numero as numero_comprobante,
        s.tipo_servicio_id,
        ts.nombre as tipo_servicio_nombre,
        s.fecha_servicio,
        s.hora_servicio
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

    // Obtener pagos con datos de operación por pago
    const [pagos] = await pool.query(`
      SELECT cp.monto, mp.nombre as metodo,
             cp.fecha_operacion, cp.hora_operacion, cp.nro_operacion, cp.obs_operacion
      FROM cobros_pagos cp
      JOIN metodos_pago mp ON cp.metodo_pago_id = mp.id
      WHERE cp.cobro_id = ?
    `, [id]);

    // Obtener items de cobro_servicios para el detalle
    const [ticketItems] = await pool.query(`
      SELECT cs.id, cs.concepto, cs.cantidad, cs.precio_unitario, cs.subtotal,
             s.tipo_servicio_id, s.fecha_servicio, s.hora_servicio
      FROM cobro_servicios cs
      LEFT JOIN servicios s ON cs.servicio_id = s.id
      WHERE cs.cobro_id = ?
    `, [id]);

    // Footer configurable
    const [config] = await pool.query(
      `SELECT valor FROM configuracion_sistema WHERE clave = 'ticket_footer_text'`
    );
    const footerText = config[0]?.valor || 'Gracias por su preferencia';

    // Generar QR con datos relevantes
    const QRCode = require('qrcode');
    const qrPayload = {
      ticket: cobro.numero_comprobante,
      fecha: cobro.fecha_cobro,
      monto: Number(cobro.monto).toFixed(2),
      concepto: cobro.concepto || '',
    };
    if (cobro.fecha_servicio) qrPayload.fecha_servicio = cobro.fecha_servicio;
    if (cobro.hora_servicio) qrPayload.hora_servicio = cobro.hora_servicio;
    const qrData = JSON.stringify(qrPayload);
    const qrImageBuffer = await QRCode.toBuffer(qrData, {
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    // PDF 80mm = 226.77pt
    const W = 226.77;
    const M = 10; // margen lateral
    const CW = W - M * 2; // content width

    const doc = new PDFDocument({
      size: [W, 700],
      margins: { top: 10, bottom: 10, left: M, right: M }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=ticket_${cobro.numero_comprobante}.pdf`);
    doc.pipe(res);

    // ═══════════ HEADER (LOGO) ═══════════
    if (fs.existsSync(LOGO_PATH)) {
      // Logo centrado. Ancho ~150pt (aprox 66% del ancho del ticket).
      const logoWidth = 150;
      const logoX = (W - logoWidth) / 2;
      doc.image(LOGO_PATH, logoX, doc.y, { width: logoWidth });
      // Avanzar Y aproximadamente la altura del logo (ratio ~0.35 para este diseño).
      doc.y += logoWidth * 0.35 + 4;
    } else {
      // Fallback: cabecera de texto si el logo no está disponible
      doc.fontSize(10).font('Helvetica-Bold')
         .text('PARROQUIA N.S.', { align: 'center' });
      doc.fontSize(9).font('Helvetica-Bold')
         .text('DE LA RECONCILIACIÓN', { align: 'center' });
      doc.moveDown(0.3);
    }
    doc.fontSize(6.5).font('Helvetica')
       .text('RUC: 20387535684', { align: 'center' });
    doc.fontSize(6)
       .text('Jr. Los Pinos 291, Urb. Camacho, La Molina', { align: 'center' });

    // Línea doble
    doc.moveDown(0.6);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.15);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    // ═══════════ TIPO DE DOCUMENTO ═══════════
    const esCaja = cobro.caja_id && !cobro.servicio_id;
    doc.fontSize(9).font('Helvetica-Bold')
       .text(esCaja ? 'COMPROBANTE - CAJA DEL AMOR' : 'COMPROBANTE DE SERVICIO', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(8).font('Helvetica-Bold')
       .text(`N° ${cobro.numero_comprobante}`, { align: 'center' });
    doc.moveDown(0.5);

    // ═══════════ FECHA / HORA DE REGISTRO ═══════════
    const fecha = new Date(cobro.fecha_cobro || Date.now());
    const TZ_LIMA = 'America/Lima';
    const fechaStr = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ_LIMA });
    const horaStr = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: TZ_LIMA });

    doc.fontSize(7.5).font('Helvetica');
    const yFecha = doc.y;
    doc.text(`Fecha: ${fechaStr}`, M, yFecha);
    doc.text(`Hora: ${horaStr}`, M, yFecha, { width: CW, align: 'right' });
    doc.moveDown(0.6);

    // ═══════════ CLIENTE / BENEFACTOR (siempre obligatorio) ═══════════
    {
      doc.moveTo(M, doc.y).lineTo(W - M, doc.y).dash(2, { space: 2 }).stroke();
      doc.undash();
      doc.moveDown(0.35);

      doc.fontSize(7.5).font('Helvetica-Bold')
         .text(esCaja ? 'BENEFACTOR:' : 'FELIGRÉS:', M);
      doc.moveDown(0.1);
      doc.fontSize(7.5).font('Helvetica')
         .text(cobro.cliente_nombre || '—', M);
      doc.text(`DNI: ${cobro.cliente_dni || '—'}`, M);
      doc.moveDown(0.5);
    }

    // ═══════════ DETALLE ═══════════
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    // Header tabla
    doc.fontSize(7).font('Helvetica-Bold');
    const yTH = doc.y;
    doc.text('DESCRIPCIÓN', M, yTH, { width: CW * 0.55 });
    doc.text('CANT', M + CW * 0.58, yTH, { width: 30, align: 'center' });
    doc.text('TOTAL', M + CW * 0.75, yTH, { width: CW * 0.25, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.25);

    // Items — renderizar múltiples líneas si hay cobro_servicios, sino fallback a línea única
    doc.fontSize(7).font('Helvetica');

    if (ticketItems.length > 0) {
      for (const ti of ticketItems) {
        const tiText = ti.concepto || 'Servicio';
        const tiHeight = doc.heightOfString(tiText, { width: CW * 0.55 });
        const yTi = doc.y;
        doc.text(tiText, M, yTi, { width: CW * 0.55 });
        doc.text(String(ti.cantidad || 1), M + CW * 0.58, yTi, { width: 30, align: 'center' });
        doc.text(`S/ ${Number(ti.subtotal).toFixed(2)}`, M + CW * 0.75, yTi, { width: CW * 0.25, align: 'right' });
        doc.y = yTi + tiHeight + 4;
      }
      doc.y += 4;
    } else {
      // Fallback: línea única (backward compat)
      const conceptoText = cobro.concepto || 'Servicio';
      const conceptoHeight = doc.heightOfString(conceptoText, { width: CW * 0.55 });
      const yItem = doc.y;
      doc.text(conceptoText, M, yItem, { width: CW * 0.55 });
      doc.text('1', M + CW * 0.58, yItem, { width: 30, align: 'center' });
      doc.text(`S/ ${Number(cobro.monto).toFixed(2)}`, M + CW * 0.75, yItem, { width: CW * 0.25, align: 'right' });
      doc.y = yItem + conceptoHeight + 8;
    }

    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    // ═══════════ FECHA/HORA DEL SERVICIO (después de la descripción) ═══════════
    const fmtHora12 = (h) => {
      if (!h) return '';
      const hParts = String(h).split(':');
      const hh = parseInt(hParts[0] || 0);
      const mm = hParts[1] || '00';
      const ampm = hh < 12 ? 'AM' : 'PM';
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      return `${h12}:${mm} ${ampm}`;
    };

    // Recolectar fecha/hora por item (solo si tiene datos)
    const itemsConFecha = ticketItems.filter(it => it.fecha_servicio);

    if (!esCaja && itemsConFecha.length > 0) {
      // Fecha y hora compartidas: usar la del primer item
      const it = itemsConFecha[0];
      const fechaServStr = new Date(it.fecha_servicio).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ_LIMA });
      const horaServStr = fmtHora12(it.hora_servicio);

      doc.fontSize(7.5).font('Helvetica-Bold')
         .text('FECHA Y HORA DEL SERVICIO:', M);
      doc.moveDown(0.15);
      doc.fontSize(7).font('Helvetica');

      const yServ = doc.y;
      doc.text(`Fecha: ${fechaServStr}`, M, yServ);
      if (horaServStr) {
        doc.text(`Hora: ${horaServStr}`, M, yServ, { width: CW, align: 'right' });
      }
      doc.moveDown(0.4);
    }

    // ═══════════ OBSERVACIONES ═══════════
    if (cobro.observaciones && String(cobro.observaciones).trim()) {
      doc.fontSize(7).font('Helvetica-Bold').text('OBSERVACIONES:', M);
      doc.moveDown(0.1);
      doc.fontSize(6.5).font('Helvetica-Oblique')
         .text(String(cobro.observaciones), M, doc.y, { width: CW });
      doc.moveDown(0.4);
    }

    // ═══════════ TOTAL ═══════════
    doc.fontSize(11).font('Helvetica-Bold');
    const yTotal = doc.y;
    doc.text('TOTAL:', M, yTotal);
    doc.text(`S/ ${Number(cobro.monto).toFixed(2)}`, M, yTotal, { width: CW, align: 'right' });
    doc.moveDown(0.6);

    // ═══════════ FORMAS DE PAGO ═══════════
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.35);

    doc.fontSize(7).font('Helvetica-Bold').text('FORMA(S) DE PAGO:', M);
    doc.moveDown(0.15);
    doc.font('Helvetica');
    pagos.forEach(pago => {
      doc.fontSize(7).font('Helvetica-Bold')
         .text(`  • ${pago.metodo}: S/ ${Number(pago.monto).toFixed(2)}`, M);
      // Datos de operación (solo si el método no es efectivo y existen datos)
      const esEfectivo = String(pago.metodo || '').toLowerCase() === 'efectivo';
      if (!esEfectivo) {
        doc.font('Helvetica').fontSize(6.5);
        if (pago.fecha_operacion) {
          const fOp = new Date(pago.fecha_operacion);
          const fOpStr = fOp.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ_LIMA });
          const hOpStr = pago.hora_operacion ? String(pago.hora_operacion).slice(0, 5) : '';
          doc.text(`      Fecha op.: ${fOpStr}${hOpStr ? '  Hora: ' + hOpStr : ''}`, M);
        } else if (pago.hora_operacion) {
          doc.text(`      Hora op.: ${String(pago.hora_operacion).slice(0, 5)}`, M);
        }
        if (pago.nro_operacion) {
          doc.text(`      N° operación: ${pago.nro_operacion}`, M);
        }
        if (pago.obs_operacion) {
          doc.text(`      Obs: ${pago.obs_operacion}`, M, doc.y, { width: CW });
        }
      }
    });

    // ═══════════ QR CODE ═══════════
    doc.moveDown(0.7);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.5);

    const qrSize = 70;
    const qrX = (W - qrSize) / 2;
    doc.image(qrImageBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
    doc.y += qrSize + 5;
    doc.fontSize(5.5).font('Helvetica')
       .text('Escanee para verificar', { align: 'center' });

    // ═══════════ FOOTER ═══════════
    doc.moveDown(0.6);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.15);
    doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    doc.fontSize(7).font('Helvetica-Bold')
       .text(footerText, { align: 'center', width: CW });

    doc.end();

  } catch (error) {
    console.error('Error generando ticket:', error);
    res.status(500).json({ success: false, error: 'No se pudo generar el ticket' });
  }
});

module.exports = router;
