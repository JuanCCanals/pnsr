// /Server/middlewares/auditoria.js
const pool = require('../config/db');

async function logAuditoria({ usuario_id, accion, tabla, registro_id, datos_anteriores = null, datos_nuevos = null, req = null }) {
  try {
    const ip = req?.ip || null;
    const ua = req?.headers?.['user-agent'] || null;
    await pool.execute(
      `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuario_id || null, accion, tabla, registro_id || null,
       datos_anteriores ? JSON.stringify(datos_anteriores) : null,
       datos_nuevos ? JSON.stringify(datos_nuevos) : null, ip, ua]
    );
  } catch (e) {
    console.error('AUDITORIA error:', e.message);
  }
}

module.exports = { logAuditoria };
