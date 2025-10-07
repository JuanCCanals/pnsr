// Importar familias con ExcelJS en el backend, adaptado a los encabezados reales del archivo Excel
// /Server/routes/FamiliasImportRoute.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const auth = require('../middlewares/auth');
const warnings = [];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ==== Helpers ====
const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const relNorm = (s) => {
  const x = norm(s);
  if (x.startsWith('PADRE')) return 'padre';
  if (x.startsWith('MADRE')) return 'madre';
  if (x.startsWith('HIJO'))  return 'hijo';
  if (x.startsWith('HIJA'))  return 'hija';
  return 'otro';
};

const calcularFechaNacimiento = (edad) => {
  const n = Number(edad);
  if (!n || n <= 0) return null;
  const y = new Date().getFullYear() - n;
  return `${y}-01-01`;
};

// Mapeo tolerante de encabezados → claves internas
function headerMap(raw) {
  const x = norm(raw);

  // Nº FAMILIA
  if (
    /^(N|NRO|N°|Nº|NUMERO)\s*FAMILIA(R)?$/.test(x) ||
    /^FAMILIA(R)?\s*(N|NRO|N°|Nº|NUMERO)$/.test(x) ||
    /^N.*FAMILIA(R)?$/.test(x) ||
    x === 'FAMILIA'
  ) return 'NRO_FAMILIA';

  // Padre/Madre
  if (/^NOMBRE(S)? PADRE$/.test(x) || /^PADRE NOMBRE(S)?$/.test(x)) return 'PADRE_NOMBRES';
  if (/^APELLIDOS? PADRE$/.test(x) || /^PADRE APELLIDOS?$/.test(x)) return 'PADRE_APELLIDOS';
  if (/^NOMBRE(S)? MADRE$/.test(x) || /^MADRE NOMBRE(S)?$/.test(x)) return 'MADRE_NOMBRES';
  if (/^APELLIDOS? MADRE$/.test(x) || /^MADRE APELLIDOS?$/.test(x)) return 'MADRE_APELLIDOS';

  // DIRECCION (muchas variantes)
  if (
    x.includes('DIREC') ||                // DIRECCION, DIRECCIÓN, DIREC., etc.
    x.includes('DOMICILIO') ||            // DOMICILIO, DOMICILIO/REFERENCIA
    x === 'DIR' ||                        // DIR
    x.includes('DIRECCION COMPLETA') ||
    x.includes('DIRECCION EXACTA') ||
    x.includes('DIRECCION FAMILIA') ||
    x.includes('DIRECCION REFERENCIA') ||
    x.includes('DIRECCION Y REFERENCIA') ||
    x.includes('DIRECCIÓN COMPLETA') ||
    x.includes('DIRECCIÓN EXACTA') ||
    x.includes('DIRECCIÓN FAMILIA') ||
    x.includes('DIRECCIÓN REFERENCIA') ||
    x.includes('DIRECCIÓN Y REFERENCIA')
  ) return 'DIRECCION';

  // Total (opcional)
  if (/^TOTAL$/.test(x)) return 'TOTAL';

  // Relación (relación, parentesco, vínculo)
  if (/^RELACI(ON|ÓN)$/.test(x) || /^PARENTESCO$/.test(x) || /^V(IN|ÍN)CULO$/.test(x)) return 'RELACION';

  // Nombres del integrante (cubre "NOMBRES", "NOMBRES Y APELLIDOS", etc. sin PADRE/MADRE)
  if ((/NOMBRE/.test(x) || /APELLIDO/.test(x)) && !/PADRE|MADRE/.test(x)) return 'INTEG_NOMBRES';

  // Sexo / Edad
  if (x === 'SEXO' || x === 'GENERO' || x === 'GÉNERO' || x === 'GENERO BIOLOGICO') return 'SEXO';
  if (x === 'EDAD') return 'EDAD';

  // Condición especial
  if (x === 'CONDICION ESPECIAL' || x === 'CONDICION' || x === 'CONDICIÓN ESPECIAL') return 'CONDICION';

  return null;
}


// Encuentra la fila de encabezados "que más encaja" (escanea primeras 20 filas)
function findHeaderRow(ws) {
  let bestRow = 1;
  let bestScore = 0;
  const maxRow = Math.min(20, ws.rowCount);

  for (let i = 1; i <= maxRow; i++) {
    const vals = ws.getRow(i).values.map(v => (typeof v === 'object' && v?.text) ? v.text : v);
    const keys = vals.map(headerMap).filter(Boolean);
    const score = new Set(keys).size; // cuántos encabezados válidos detecta en esa fila
    if (score > bestScore) { bestScore = score; bestRow = i; }
  }
  return bestRow;
}

// ==== Endpoint principal ====
/**
 * POST /api/familias/import-excel
 * FormData: file (.xlsx), zona_id (obligatoria)
 */
router.post('/', auth, upload.any(), async (req, res) => {
  const file = Array.isArray(req.files) && req.files[0];
  const { zona_id } = req.body;

  if (!file)   return res.status(400).json({ success: false, message: 'Archivo .xlsx requerido' });
  if (!zona_id) return res.status(400).json({ success: false, message: 'zona_id es requerida' });

  // Zona (para código único y FK)
  const [[zona]] = await pool.query(
    'SELECT id, abreviatura, nombre FROM zonas WHERE id = ? AND activo = 1',
    [zona_id]
  );
  if (!zona) return res.status(400).json({ success: false, message: 'Zona inválida o inactiva' });

  // Cargar Excel
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(file.buffer); } catch {
    return res.status(400).json({ success: false, message: 'Archivo Excel inválido' });
  }
  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ success: false, message: 'Hoja vacía' });

  // Detectar encabezados (robusto)
  const headerRow = findHeaderRow(ws);

  // Mapear títulos → índices
  const titles = ws.getRow(headerRow).values.map(v => (typeof v === 'object' && v?.text) ? v.text : v);
  const idx = {};
  titles.forEach((t, i) => { const k = headerMap(t); if (k) idx[k] = i; });

  // Requisitos mínimos (sin ZONA)
  const required = ['NRO_FAMILIA', 'DIRECCION', 'RELACION', 'INTEG_NOMBRES'];
  const faltantes = required.filter(k => !idx[k]);
  if (faltantes.length) {
    // Ayuda de depuración: devuelve títulos detectados (normalizados)
    const debugTitles = titles.map(norm).filter(Boolean);
    return res.status(400).json({
      success: false,
      message: `Faltan columnas: ${faltantes.join(', ')}`,
      detected_header_row: headerRow,
      detected_titles: debugTitles
    });
  }

  // Parsear filas → agrupar por NRO_FAMILIA
  const grupos = new Map();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k) => {
      const pos = idx[k];
      if (!pos) return '';
      const cell = row.getCell(pos);
      const val = (cell.text ?? cell.value ?? '').toString().trim();
      return val;
    };

    const nro = get('NRO_FAMILIA');
    const direccion = get('DIRECCION');
    if (!nro && !direccion) continue; // fila vacía o irrelevante

    // Familia (se repiten por fila → nos quedamos con el primer valor no vacío)
    const padre = [get('PADRE_NOMBRES'), get('PADRE_APELLIDOS')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const madre = [get('MADRE_NOMBRES'), get('MADRE_APELLIDOS')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const total = Number(get('TOTAL')) || null;

    // Integrante
    const rel = relNorm(get('RELACION'));
    const nombreInt = get('INTEG_NOMBRES');
    const edad = Number(get('EDAD')) || null;
    const cond = get('CONDICION') || null;
    const sexoRaw = (get('SEXO') || '').toUpperCase();
    const sexo = sexoRaw.startsWith('M') ? 'M' : (sexoRaw.startsWith('F') ? 'F' : null);

    const key = String(nro);
    if (!grupos.has(key)) grupos.set(key, { familia: { nro, direccion, padre: null, madre: null, total }, integrantes: [] });
    const g = grupos.get(key);

    if (!g.familia.direccion && direccion) g.familia.direccion = direccion;
    if (!g.familia.padre && padre) g.familia.padre = padre;
    if (!g.familia.madre && madre) g.familia.madre = madre;
    if (!g.familia.total && total != null) g.familia.total = total;

    // SOLO hijos/hijas/otros (padre/madre NO van a integrantes)
    if (nombreInt && (rel === 'hijo' || rel === 'hija' || rel === 'otro')) {
      g.integrantes.push({
        nombre: nombreInt,
        relacion: rel,
        fecha_nacimiento: calcularFechaNacimiento(edad),
        sexo,
        observaciones: cond || null
      });
    }
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  let familiasInsertadas = 0, familiasActualizadas = 0, integrantesInsertados = 0;

  try {
    for (const [, pack] of grupos) {
      const { familia, integrantes } = pack;

      // código único: <ABREV><NNN>  (si prefieres guion: `${zona.abreviatura}-${nroPadded}`)
      const nroPadded = String(familia.nro || '').padStart(3, '0');
      const codigo_unico = `${zona.abreviatura}${nroPadded}`;

      // UPSERT familia por codigo_unico
      const [existing] = await conn.query('SELECT id FROM familias WHERE codigo_unico = ?', [codigo_unico]);
      let familia_id;

      if (existing.length) {
        familia_id = existing[0].id;
        await conn.query(
          `UPDATE familias
             SET zona_id=?, direccion=?, nombre_padre=?, nombre_madre=?, dependientes=?, activo=1
           WHERE id=?`,
          [
            zona.id,
            familia.direccion || null,
            familia.padre || null,
            familia.madre || null,
            (familia.total || integrantes.length || 0),
            familia_id
          ]
        );
        familiasActualizadas++;
        await conn.query('DELETE FROM integrantes_familia WHERE familia_id=?', [familia_id]);
      } else {
        const [ins] = await conn.query(
          `INSERT INTO familias (codigo_unico, zona_id, direccion, nombre_padre, nombre_madre, dependientes, activo)
           VALUES (?,?,?,?,?, ?,1)`,
          [
            codigo_unico,
            zona.id,
            familia.direccion || null,
            familia.padre || null,
            familia.madre || null,
            (familia.total || integrantes.length || 0)
          ]
        );
        familia_id = ins.insertId;
        familiasInsertadas++;
      }

      // Integrantes (hijos/hijas/otros)
      for (const it of integrantes) {
        await conn.query(
          `INSERT INTO integrantes_familia (familia_id, nombre, fecha_nacimiento, relacion, sexo, observaciones)
           VALUES (?,?,?,?,?,?)`,
          [familia_id, it.nombre, it.fecha_nacimiento, it.relacion, it.sexo, it.observaciones]
        );
        integrantesInsertados++;
      }
    }

    await conn.commit();
    conn.release();
    res.json({
      success: true,
      message: 'Importación completada exitosamente',
      resumen: { familiasInsertadas, familiasActualizadas, integrantesInsertados, grupos: grupos.size, zona: { id: zona.id, abreviatura: zona.abreviatura } }
    });
  } catch (e) {
    await conn.rollback();
    conn.release();
    console.error('IMPORT familias error:', e);
    res.status(500).json({ success: false, message: 'Error importando familias' });
  }
});

module.exports = router;
