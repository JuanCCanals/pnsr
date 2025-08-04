// backend/routes/FamiliasImportRoute.js
// Importar familias con ExcelJS en el backend, adaptado a los encabezados reales del archivo Excel
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const auth = require('../middlewares/auth');

// Multer: recibe archivos en memoria, límite 2MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * POST /api/familias/import-excel
 * Recibe archivo .xlsx, parsea columnas adaptadas:
 * - ZONA
 * - NOMBRE PADRE + APELLIDOS PADRE -> nombres_padre
 * - NOMBRE MADRE + APELLIDOS MADRE -> nombres_madre
 * - DIRECCION
 * - TOTAL -> dependientes
 * Omite TELEFONO si no existe (queda vacío).
 */
router.post('/', auth, upload.any(), async (req, res) => {
  // Tomar primer archivo subido
  const file = Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null;
  if (!file) {
    return res.status(400).json({ message: 'Archivo .xlsx requerido' });
  }

  let conn;
  try {
    // Cargar workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const sheet = workbook.worksheets[0];

    // Leer encabezados reales
    const headerRow = sheet.getRow(1);
   // Normalizamos cada header: quitamos nulos, trim y colapsamos espacios internos
    const headers = headerRow.values
    .slice(1)
    .map(h => String(h || '')
      .trim()
      .replace(/\s+/g, ' '));

    // Definir columnas esperadas según archivo proporcionado
    const required = [
      'ZONA',
      'NOMBRE PADRE',
      'APELLIDOS PADRE',
      'NOMBRE MADRE',
      'APELLIDOS MADRE',
      'DIRECCION',
      'TOTAL'
    ];
    const missing = required.filter(col => !headers.includes(col));
    if (missing.length) {
      return res.status(400).json({ message: `Columnas faltantes en el Excel: ${missing.join(', ')}` });
    }
    const colMap = headers.reduce((map, h, i) => ({ ...map, [h]: i + 1 }), {});

    // Iniciar transacción
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Procesar filas (desde fila 2)
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      // Saltar filas completamente vacías
      if (row.values.slice(1).every(v => v === null || String(v).trim() === '')) continue;

      const ZONA = String(row.getCell(colMap['ZONA']).value || '').trim();
      const NOMBRE_PADRE = String(row.getCell(colMap['NOMBRE PADRE']).value || '').trim();
      const APELLIDOS_PADRE = String(row.getCell(colMap['APELLIDOS PADRE']).value || '').trim();
      const NOMBRE_MADRE = String(row.getCell(colMap['NOMBRE MADRE']).value || '').trim();
      const APELLIDOS_MADRE = String(row.getCell(colMap['APELLIDOS MADRE']).value || '').trim();
      const DIRECCION = String(row.getCell(colMap['DIRECCION']).value || '').trim();
      const TOTAL = parseInt(row.getCell(colMap['TOTAL']).value) || 0;
      if (!ZONA || !NOMBRE_PADRE) continue;

      // Construir datos de familia
      const nombres_padre = `${NOMBRE_PADRE} ${APELLIDOS_PADRE}`.trim();
      const nombres_madre = `${NOMBRE_MADRE} ${APELLIDOS_MADRE}`.trim();
      const dependientes = TOTAL;
      const telefono = ''; // No provisto en Excel

      // Zona: buscar o crear
      let [zones] = await conn.query('SELECT id FROM zonas WHERE abreviatura = ?', [ZONA]);
      let zona_id;
      if (!zones.length) {
        const [insZ] = await conn.query(
          'INSERT INTO zonas (abreviatura, nombre, activo) VALUES (?,?,1)',
          [ZONA, `Zona ${ZONA}`]
        );
        zona_id = insZ.insertId;
      } else {
        zona_id = zones[0].id;
      }

      // Correlativo y código único
      const [cntRes] = await conn.query(
        'SELECT COUNT(*) AS total FROM familias WHERE zona_id = ?',
        [zona_id]
      );
      const correl = String(cntRes[0].total + 1).padStart(3, '0');
      const codigo_unico = `${ZONA}${correl}`;

      // Insertar familia
      await conn.query(
        `INSERT INTO familias 
          (zona_id, codigo_unico, nombre_padre, nombre_madre,
           direccion, telefono, dependientes)
         VALUES (?,?,?,?,?,?,?)`,
        [zona_id, codigo_unico, nombres_padre, nombres_madre, DIRECCION, telefono, dependientes]
      );
    }

    // Commit
    await conn.commit();
    conn.release();
    return res.json({ message: 'Importación completada exitosamente' });
  } catch (err) {
    console.error('Error importando Excel:', err);
    if (conn) {
      try { await conn.rollback(); conn.release(); } catch (_) {}
    }
    return res.status(500).json({ message: 'Error procesando archivo', error: err.message });
  }
});

module.exports = router;
