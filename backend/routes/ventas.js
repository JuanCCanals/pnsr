// /Server/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');
const { logAuditoria } = require('../middlewares/auditoria');

// POST /api/ventas  { caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id(opc), monto, moneda='PEN' }
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { caja_id, benefactor_id = null, modalidad_id, punto_venta_id, monto, moneda = 'PEN' } = req.body;
    const usuario_id = req.user?.id || 1;
    if (!caja_id || !modalidad_id || !punto_venta_id || !monto) {
      return res.status(400).json({ success:false, error:'caja_id, modalidad_id, punto_venta_id y monto son obligatorios' });
    }

    // Inserta movimiento
    const [r] = await pool.execute(`
      INSERT INTO ventas_cajas (caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto, moneda, estado_pago)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PAGADO')`,
      [caja_id, benefactor_id, modalidad_id, punto_venta_id, usuario_id, monto, moneda]
    );

    // Actualiza estado de la caja si aplica
    await pool.execute(`UPDATE cajas SET estado='entregada', fecha_entrega=NOW(), benefactor_id=COALESCE(?, benefactor_id), modalidad_id=?, punto_venta_id=? WHERE id=?`,
      [benefactor_id, modalidad_id, punto_venta_id, caja_id]
    );

    await logAuditoria({
      usuario_id, accion:'CREATE', tabla:'ventas_cajas', registro_id:r.insertId, datos_nuevos:req.body, req
    });

    res.status(201).json({ success:true, data:{ id:r.insertId } });
  } catch (e) {
    console.error('VENTAS create:', e);
    res.status(500).json({ success:false, error:'Error interno' });
  }
});

module.exports = router;
