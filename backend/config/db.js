// /Server/config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pnsr_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // La BD (contenedor Docker / VPS Linux) almacena DATETIMEs en UTC.
  // Al interpretar los strings como UTC, Node los convierte correctamente
  // al formatearlos con toLocaleString('es-PE') (America/Lima, UTC-5).
  timezone: 'Z',
});

module.exports = pool;