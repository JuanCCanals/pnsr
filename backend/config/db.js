// /Server/config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

// Forzamos toda la pila a operar en zona horaria Lima (UTC-5):
//   1. Pool option `timezone: '-05:00'` → mysql2 serializa/deserializa DATETIME asumiendo -05:00
//   2. `SET time_zone = '-05:00'` en cada conexión nueva → NOW() y CURRENT_TIMESTAMP devuelven hora Lima
//      sin importar la TZ del SO (UTC en Docker local, CDT en el VPS).
//   3. `dateStrings: ['DATE']` para columnas DATE (sin hora) → evita desfase de día.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pnsr_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-05:00',
  dateStrings: ['DATE'],
});

// SET time_zone en cada conexión nueva (no en cada query, solo cuando se abre la conexión).
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '-05:00'");
});

module.exports = pool;