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

// GET /api/cobros/:id/ticket  -> PDF 80mm
router.get('/:id/ticket', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`
      SELECT cb.*, mp.nombre AS metodo_pago, c.nombre AS cliente_nombre, c.dni AS cliente_dni
      FROM cobros cb
      JOIN metodos_pago mp ON mp.id = cb.metodo_pago_id
      JOIN clientes c ON c.id = cb.cliente_id
      WHERE cb.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success:false, error:'No encontrado' });
    const cb = rows[0];

    const doc = new PDFDocument({ size:[226.77, 600], margins:{ top:12, bottom:12, left:10, right:10 }});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=recibo_${cb.numero_comprobante}.pdf`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(11).text(process.env.ENTIDAD_NOMBRE || 'Parroquia N.S. de la Reconciliación', { align:'center' });
    if (process.env.ENTIDAD_RUC) doc.fontSize(9).text(`RUC: ${process.env.ENTIDAD_RUC}`, { align:'center' });
    doc.fontSize(9).text(`Recibo: ${cb.numero_comprobante}`, { align:'center' });
    doc.fontSize(9).text(`Fecha: ${new Date(cb.fecha_cobro || Date.now()).toLocaleString('es-PE')}`, { align:'center' });
    doc.moveDown(0.4); doc.moveTo(10, doc.y).lineTo(216.77, doc.y).stroke();

    // Cuerpo
    doc.moveDown(0.6);
    doc.fontSize(9).text(`Cliente: ${cb.cliente_nombre}${cb.cliente_dni ? ' (DNI ' + cb.cliente_dni + ')' : ''}`);
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
    doc.end();
  } catch (e) {
    console.error('COBROS ticket:', e);
    res.status(500).json({ success:false, error:'No se pudo generar el ticket' });
  }
});

module.exports = router;
