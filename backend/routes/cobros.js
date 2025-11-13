// /Server/routes/cobros.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const { logAuditoria } = require('../middlewares/auditoria');
const PDFDocument = require('pdfkit');

function pad6(n){ return String(n).padStart(6,'0'); }
async function generarNumero(prefix='REC'){ // REC-YYYY-000001
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const [[{ max_num }]] = await pool.query(`
    SELECT MAX(CAST(SUBSTRING(numero_comprobante, -6) AS UNSIGNED)) AS max_num
    FROM cobros
    WHERE numero_comprobante LIKE ?`, [like]);
  return `${prefix}-${year}-${pad6((max_num||0)+1)}`;
}

// === Helpers de render de ticket ===
async function getCobro(id) {
  return httpGet(`/api/cobros/${id}`);
}

// Genera HTML 80mm estilo Familias y manda a imprimir sin preview
function printTicket80(cobro) {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { font-family: Arial, sans-serif; }
  .t { width: 100%; font-size: 11px; }
  .hdr { text-align:center; font-weight:700; font-size:12px; margin-bottom:6px; }
  .sep { border-top:1px solid #000; margin:6px 0; }
  .row { display:flex; justify-content:space-between; }
  .right { text-align:right; }
  .mt4 { margin-top:4px; }
</style>
</head>
<body>
  <div class="t">
    <div class="hdr">${(window.ENTIDAD_NOMBRE || 'Parroquia N.S. de la Reconciliación')}</div>
    <div style="text-align:center">RECIBO: ${cobro.numero_comprobante}</div>
    <div style="text-align:center">FECHA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleDateString('es-PE')}
      &nbsp;HORA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleTimeString('es-PE')}</div>
    <div class="sep"></div>

    <div><b>CLIENTE:</b> ${cobro.cliente_nombre || ''}${cobro.cliente_dni ? ' (DNI ' + cobro.cliente_dni + ')' : ''}</div>
    <div class="mt4"><b>ITEM</b></div>
    <div class="row"><div>${cobro.concepto || 'Servicio'}</div><div class="right">S/ ${(Number(cobro.monto)||0).toFixed(2)}</div></div>
    <div class="sep"></div>
    <div class="row"><div><b>TOTAL</b></div><div class="right"><b>S/ ${(Number(cobro.monto)||0).toFixed(2)}</b></div></div>
    <div class="mt4">PAGO: ${cobro.metodo_pago || ''}</div>

    <div class="sep"></div>
    <div style="font-size:9px; text-align:center;">
      ${'Documento sin efectos legales del sistema jurídico nacional (Canon 222 §1 CDC).'}
    </div>
  </div>
  <script>window.onload = () => { window.print(); setTimeout(()=>window.close(), 300); };</script>
</body>
</html>`;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
}

// Asegura cliente por nombre/dni y devuelve su id
router.post('/ensure-cliente', authenticateToken, async (req, res) => {
  try {
    let { nombre = '', dni = '' } = req.body || {};
    const nom = String(nombre).trim();
    const doc = String(dni || '').trim();

    if (!nom) return res.status(400).json({ success:false, error:'Nombre requerido' });
    if (nom.length > 100) return res.status(400).json({ success:false, error:'Nombre demasiado largo' });
    if (doc && !/^\d{8}$/.test(doc)) {
      return res.status(400).json({ success:false, error:'DNI inválido (8 dígitos)' });
    }

    // 1) si viene DNI, intenta por DNI
    if (doc) {
      const [r1] = await pool.query('SELECT id FROM clientes WHERE dni = ? LIMIT 1', [doc]);
      if (r1.length) return res.json({ success:true, data:{ id: r1[0].id } });
    }

    // 2) intenta por nombre exacto
    const [r2] = await pool.query('SELECT id FROM clientes WHERE nombre = ? LIMIT 1', [nom]);
    if (r2.length) return res.json({ success:true, data:{ id: r2[0].id } });

    // 3) crea (usa ACTIVO, no "estado")
    try {
      const [ins] = await pool.execute(
        'INSERT INTO clientes (nombre, dni, activo) VALUES (?, ?, 1)',
        [nom, doc || null]
      );
      return res.json({ success:true, data:{ id: ins.insertId } });
    } catch (e) {
      // si chocó por DNI duplicado, devuelve el existente
      if (e && e.code === 'ER_DUP_ENTRY' && doc) {
        const [r3] = await pool.query('SELECT id FROM clientes WHERE dni = ? LIMIT 1', [doc]);
        if (r3.length) return res.json({ success:true, data:{ id: r3[0].id } });
      }
      console.error('ensure-cliente INSERT:', e);
      return res.status(500).json({ success:false, error:'No se pudo asegurar cliente (DB)' });
    }
  } catch (e) {
    console.error('ensure-cliente:', e);
    res.status(500).json({ success:false, error:'No se pudo asegurar cliente' });
  }
});



function renderTicketDefault(doc, cb, { mostrarCliente }) {
  // Encabezado
  doc.fontSize(11).text(process.env.ENTIDAD_NOMBRE || 'Parroquia N.S. de la Reconciliación', { align:'center' });
  if (process.env.ENTIDAD_RUC) doc.fontSize(9).text(`RUC: ${process.env.ENTIDAD_RUC}`, { align:'center' });
  doc.fontSize(9).text(`Recibo: ${cb.numero_comprobante}`, { align:'center' });
  doc.fontSize(9).text(`Fecha: ${new Date(cb.fecha_cobro || Date.now()).toLocaleString('es-PE')}`, { align:'center' });
  doc.moveDown(0.4); doc.moveTo(10, doc.y).lineTo(216.77, doc.y).stroke();

  // Cuerpo
  doc.moveDown(0.6);
  if (mostrarCliente && cb.cliente_nombre) {
    doc.fontSize(9).text(`Cliente: ${cb.cliente_nombre}${cb.cliente_dni ? ' (DNI ' + cb.cliente_dni + ')' : ''}`);
  }
  if (cb.servicio_id) doc.fontSize(9).text(`Servicio ID: ${cb.servicio_id}`);
  if (cb.caja_id)     doc.fontSize(9).text(`Caja ID: ${cb.caja_id}`);
  doc.fontSize(9).text(`Concepto: ${cb.concepto}`);
  doc.moveDown(0.4);
  doc.fontSize(11).text(`Importe: S/ ${Number(cb.monto).toFixed(2)}`);
  doc.fontSize(9).text(`Método de pago: ${cb.metodo_pago}`);

  // Pie
  doc.moveDown(0.8); doc.moveTo(10, doc.y).lineTo(216.77, doc.y).stroke(); doc.moveDown(0.4);
  doc.fontSize(7).text(process.env.TICKET_FOOTER_CANON || 'Este comprobante no reemplaza documentos tributarios.', { align:'center', width:206 });
  doc.moveDown(0.2);
  doc.fontSize(8).text(process.env.ENTIDAD_WEB || 'pnsr.prodixperu.com', { align:'center' });
}

function renderTicketFamilias(doc, cb, { mostrarCliente }) {
  // Cabecera compacta tipo "Familias"
  doc.fontSize(12).text(process.env.ENTIDAD_NOMBRE || 'Parroquia N.S. de la Reconciliación', { align:'center' });
  doc.moveDown(0.2);

  // Serie y número (si tu numero_comprobante = REC-YYYY-000001)
  const num = String(cb.numero_comprobante || '');
  doc.fontSize(10).text(`N° TICKET: ${num}`, { align:'center' });
  doc.moveDown(0.2);
  doc.text(`FECHA: ${new Date(cb.fecha_cobro || Date.now()).toLocaleDateString('es-PE')}   HORA: ${new Date(cb.fecha_cobro || Date.now()).toLocaleTimeString('es-PE')}`, { align:'center' });

  doc.moveDown(0.5);
  // Cabecera de columnas
  doc.fontSize(9);
  const y0 = doc.y;
  doc.text('ITEM', 10, y0);
  doc.text('CANT', 130, y0);
  doc.text('P.UNIT', 165, y0);
  doc.text('SUBTOTAL', 200, y0, { width: 210, align:'right' });
  doc.moveDown(0.3);
  doc.moveTo(10, doc.y).lineTo(216.77, doc.y).stroke();

  // Ítem único (concepto)
  const cantidad = 1;
  const punit = Number(cb.monto || 0);
  const subtotal = punit * cantidad;

  doc.moveDown(0.2);
  const y1 = doc.y;
  doc.text(cb.concepto || 'Servicio', 10, y1, { width: 110 });
  doc.text(String(cantidad), 130, y1);
  doc.text(`S/ ${punit.toFixed(2)}`, 165, y1);
  doc.text(`S/ ${subtotal.toFixed(2)}`, 200, y1, { width: 210, align:'right' });

  // Total
  doc.moveDown(0.6);
  doc.fontSize(11).text(`TOTAL: S/ ${subtotal.toFixed(2)}`, { align:'right' });

  // Método de pago
  doc.moveDown(0.2);
  doc.fontSize(9).text(`PAGO: ${cb.metodo_pago || 'Efectivo'}`);

  // Cliente (si se desea mostrar)
  if (mostrarCliente && cb.cliente_nombre) {
    doc.moveDown(0.2);
    doc.text(`CLIENTE: ${cb.cliente_nombre}${cb.cliente_dni ? ' (DNI ' + cb.cliente_dni + ')' : ''}`);
  }

  // Nota legal corta
  doc.moveDown(0.8);
  doc.fontSize(7).text(process.env.TICKET_FOOTER_CANON || 'Documento sin efectos legales del sistema jurídico nacional (Canon 222 §1 CDC).', { align:'center', width:206 });
}


// POST /api/cobros
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { servicio_id = null, caja_id = null, cliente_id, concepto, monto, metodo_pago_id, observaciones = null } = req.body;
    if (!cliente_id || !concepto || !monto || !metodo_pago_id) {
      return res.status(400).json({ success:false, error:'cliente_id, concepto, monto, metodo_pago_id son obligatorios' });
    }
    if (!servicio_id && !caja_id) {
      return res.status(400).json({ success:false, error:'Debe indicar servicio_id o caja_id' });
    }

    const numero_comprobante = await generarNumero('REC');

    const [rCobro] = await pool.execute(`
      INSERT INTO cobros (servicio_id, caja_id, cliente_id, concepto, monto, metodo_pago_id, numero_comprobante, observaciones, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [servicio_id, caja_id, cliente_id, concepto, monto, metodo_pago_id, numero_comprobante, observaciones, req.user?.id || 1]
    );

    // crea comprobante vinculado
    const [rComp] = await pool.execute(`
      INSERT INTO comprobantes (cobro_id, numero, tipo)
      VALUES (?, ?, 'recibo')`, [rCobro.insertId, numero_comprobante]
    );

    await logAuditoria({
      usuario_id: req.user?.id, accion:'CREATE', tabla:'cobros', registro_id:rCobro.insertId,
      datos_nuevos:{...req.body, numero_comprobante}, req
    });

    res.status(201).json({ success:true, data:{ id: rCobro.insertId, numero_comprobante, comprobante_id: rComp.insertId }});
  } catch (e) {
    console.error('COBROS create:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// GET /api/cobros/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`
      SELECT cb.*, mp.nombre AS metodo_pago, c.nombre AS cliente_nombre, c.dni AS cliente_dni
      FROM cobros cb
      JOIN metodos_pago mp ON mp.id = cb.metodo_pago_id
      JOIN clientes c ON c.id = cb.cliente_id
      WHERE cb.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success:false, error:'No encontrado' });
    res.json({ success:true, data: rows[0] });
  } catch (e) {
    console.error('COBROS get:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

// GET /api/cobros/:id/ticket  -> PDF 80mm con plantillas
router.get('/:id/ticket', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tpl = 'familias', hideCliente = '1' } = req.query; // 👈 nuevo

    const [rows] = await pool.query(`
      SELECT cb.*, mp.nombre AS metodo_pago, c.nombre AS cliente_nombre, c.dni AS cliente_dni
      FROM cobros cb
      JOIN metodos_pago mp ON mp.id = cb.metodo_pago_id
      JOIN clientes c ON c.id = cb.cliente_id
      WHERE cb.id = ?`, [id]);

    if (!rows.length) return res.status(404).json({ success:false, error:'No encontrado' });
    const cb = rows[0];

    // PDF 80mm (226.77pt) - altura flexible
    const doc = new PDFDocument({ size:[226.77, 600], margins:{ top:12, bottom:12, left:10, right:10 }});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=recibo_${cb.numero_comprobante}.pdf`);
    doc.pipe(res);

    const mostrarCliente = hideCliente !== '1';

    if (tpl === 'familias') {
      renderTicketFamilias(doc, cb, { mostrarCliente });
    } else {
      renderTicketDefault(doc, cb, { mostrarCliente });
    }

    doc.end();
  } catch (e) {
    console.error('COBROS ticket:', e);
    res.status(500).json({ success:false, error:'No se pudo generar el ticket' });
  }
});


module.exports = router;
