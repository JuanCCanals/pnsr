// backend/routes/FamiliasImportRoute.js
// Importación de familias con ExcelJS.
// Usa uploadExcelGate (campo: "archivo") y expone:
//  - POST /api/familias/import-excel/validate
//  - POST /api/familias/import-excel

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const auth = require('../middlewares/auth');
const { uploadExcelGate } = require('../middlewares/uploadExcel');

// ==== Helpers ====
const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita tildes
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const relNorm = (s) => {
  const x = norm(s);

  // Padres (se excluyen de integrantes)
  if (x.startsWith('PADRE')) return 'padre';
  if (x.startsWith('MADRE')) return 'madre';

  // Hijos directos
  if (x.startsWith('HIJO')) return 'hijo';
  if (x.startsWith('HIJA')) return 'hija';

  // Abuelos
  if (x.startsWith('ABUELO')) return 'abuelo';
  if (x.startsWith('ABUELA')) return 'abuela';

  // Nietos
  if (x.startsWith('NIETO')) return 'nieto';
  if (x.startsWith('NIETA')) return 'nieta';

  // Hermanos
  if (x.startsWith('HERMANO')) return 'hermano';
  if (x.startsWith('HERMANA')) return 'hermana';

  // Tios / Sobrinos
  if (x.startsWith('TIO')) return 'tio';
  if (x.startsWith('TIA')) return 'tia';
  if (x.startsWith('SOBRINO')) return 'sobrino';
  if (x.startsWith('SOBRINA')) return 'sobrina';

  // Suegros / Yerno / Nuera
  if (x.startsWith('SUEGRO')) return 'suegro';
  if (x.startsWith('SUEGRA')) return 'suegra';
  if (x.startsWith('YERNO')) return 'yerno';
  if (x.startsWith('NUERA')) return 'nuera';

  // Padrastros / Hijastros
  if (x.startsWith('PADRASTRO')) return 'padrastro';
  if (x.startsWith('MADRASTRA')) return 'madrastra';
  if (x.startsWith('HIJASTRO')) return 'hijastro';
  if (x.startsWith('HIJASTRA')) return 'hijastra';

  // Cónyuge / Esposo(a)
  if (x.startsWith('CONYUGE') || x.startsWith('CONYUGUE')) return 'conyuge';
  if (x.startsWith('ESPOSO')) return 'esposo';
  if (x.startsWith('ESPOSA')) return 'esposa';

  // Primos
  if (x.startsWith('PRIMO')) return 'primo';
  if (x.startsWith('PRIMA')) return 'prima';

  // Tutor / encargados
  if (x.startsWith('TUTOR')) return 'tutor';
  if (x.startsWith('APODERADO') || x.startsWith('ENCARGADO')) return 'tutor';

  // Genéricos frecuentes
  if (x.startsWith('BEBE') || x.startsWith('LACTANTE')) return 'bebe';
  if (x.startsWith('OTRO')) return 'otro';

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
  )
    return 'NRO_FAMILIA';

  // Padre/Madre
  if (/^NOMBRE(S)? PADRE$/.test(x) || /^PADRE NOMBRE(S)?$/.test(x)) return 'PADRE_NOMBRES';
  if (/^APELLIDOS? PADRE$/.test(x) || /^PADRE APELLIDOS?$/.test(x)) return 'PADRE_APELLIDOS';
  if (/^NOMBRE(S)? MADRE$/.test(x) || /^MADRE NOMBRE(S)?$/.test(x)) return 'MADRE_NOMBRES';
  if (/^APELLIDOS? MADRE$/.test(x) || /^MADRE APELLIDOS?$/.test(x)) return 'MADRE_APELLIDOS';

  // DIRECCION (muchas variantes)
  if (
    x.includes('DIREC') || // DIRECCION, DIRECCIÓN, DIREC., etc.
    x.includes('DOMICILIO') || // DOMICILIO, DOMICILIO/REFERENCIA
    x === 'DIR' || // DIR
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
  )
    return 'DIRECCION';

  // Total (opcional)
  if (/^TOTAL$/.test(x)) return 'TOTAL';

  // Relación (relación, parentesco, vínculo)
  if (/^RELACI(ON|ÓN)$/.test(x) || /^PARENTESCO$/.test(x) || /^V(IN|ÍN)CULO$/.test(x))
    return 'RELACION';

  // Nombres del integrante (sin PADRE/MADRE)
  if ((/NOMBRE/.test(x) || /APELLIDO/.test(x)) && !/PADRE|MADRE/.test(x))
    return 'INTEG_NOMBRES';

  // Sexo / Edad
  if (x === 'SEXO' || x === 'GENERO' || x === 'GÉNERO' || x === 'GENERO BIOLOGICO')
    return 'SEXO';
  if (x === 'EDAD') return 'EDAD';

  // Condición especial
  if (x === 'CONDICION ESPECIAL' || x === 'CONDICION' || x === 'CONDICIÓN ESPECIAL')
    return 'CONDICION';

  return null;
}

// Encuentra la fila de encabezados "que más encaja"
function findHeaderRow(ws) {
  let bestRow = 1;
  let bestScore = 0;
  const maxRow = Math.min(20, ws.rowCount);

  for (let i = 1; i <= maxRow; i++) {
    const vals = ws
      .getRow(i)
      .values.map((v) => (typeof v === 'object' && v?.text ? v.text : v));
    const keys = vals.map(headerMap).filter(Boolean);
    const score = new Set(keys).size;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestRow;
}

// === Función común de parseo + validaciones ===
async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Hoja vacía');

  const headerRow = findHeaderRow(ws);

  const titles = ws
    .getRow(headerRow)
    .values.map((v) => (typeof v === 'object' && v?.text ? v.text : v));
  const idx = {};
  titles.forEach((t, i) => {
    const k = headerMap(t);
    if (k) idx[k] = i;
  });

  const required = ['NRO_FAMILIA', 'DIRECCION', 'RELACION', 'INTEG_NOMBRES'];
  const faltantes = required.filter((k) => !idx[k]);
  if (faltantes.length) {
    const debugTitles = titles.map(norm).filter(Boolean);
    const err = new Error(`Faltan columnas: ${faltantes.join(', ')}`);
    err.detected_header_row = headerRow;
    err.detected_titles = debugTitles;
    err.isValidation = true;
    err.validationErrors = faltantes.map((col) => ({
      type: 'FALTA_COLUMNA',
      columna: col,
      message: `Falta la columna obligatoria ${col}`,
    }));
    throw err;
  }

  const grupos = new Map();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    const get = (k) => {
      const pos = idx[k];
      if (!pos) return '';
      const cell = row.getCell(pos);
      if (!cell || cell.value == null) return '';
      if (typeof cell.value === 'object' && cell.value.text) {
        return String(cell.value.text).trim();
      }
      return String(cell.text || cell.value || '').trim();
    };

    const nro = get('NRO_FAMILIA');
    const direccion = get('DIRECCION');
    if (!nro && !direccion) continue; // fila vacía o irrelevante

    // Familia (se repiten por fila → nos quedamos con el primer valor no vacío)
    const padre = [get('PADRE_NOMBRES'), get('PADRE_APELLIDOS')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const madre = [get('MADRE_NOMBRES'), get('MADRE_APELLIDOS')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const total = Number(get('TOTAL')) || null;

    // Integrante
    const rel = relNorm(get('RELACION'));
    const nombreInt = get('INTEG_NOMBRES');
    const edad = Number(get('EDAD')) || null;
    const cond = get('CONDICION') || null;
    const sexoRaw = (get('SEXO') || '').toUpperCase();
    const sexo = sexoRaw.startsWith('M') ? 'M' : sexoRaw.startsWith('F') ? 'F' : null;

    const key = String(nro);

    if (!grupos.has(key)) {
      grupos.set(key, {
        familia: {
          nro,
          direccion,
          padre: null,
          madre: null,
          total,
          row: r,
        },
        integrantes: [],
      });
    }

    const g = grupos.get(key);

    if (!g.familia.direccion && direccion) g.familia.direccion = direccion;
    if (!g.familia.padre && padre) g.familia.padre = padre;
    if (!g.familia.madre && madre) g.familia.madre = madre;
    if (!g.familia.total && total != null) g.familia.total = total;

    // Todo lo que NO sea padre/madre entra como integrante
    if (nombreInt && !(rel === 'padre' || rel === 'madre')) {
      g.integrantes.push({
        nombre: nombreInt,
        relacion: rel,
        fecha_nacimiento: calcularFechaNacimiento(edad),
        sexo,
        observaciones: cond || null,
      });
    }
  }

  // ==== VALIDACIONES FINALES ====
  const validationErrors = [];
  for (const [key, pack] of grupos) {
    const fam = pack.familia;
    const dir = (fam.direccion || '').trim();
    if (!dir) {
      validationErrors.push({
        type: 'SIN_DIRECCION',
        message: 'Familia sin dirección',
        nro_familia: fam.nro || key,
        row: fam.row || null,
      });
    }
  }

  if (validationErrors.length) {
    const err = new Error(
      'Se encontraron familias con dirección vacía. Corrige el archivo y vuelve a intentar.'
    );
    err.isValidation = true;
    err.validationErrors = validationErrors;
    throw err;
  }

  return { grupos, headerRow, titles };
}

// ==== Endpoint de validación (PRE IMPORTACIÓN) ====
// POST /api/familias/import-excel/validate
router.post('/validate', auth, uploadExcelGate, async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'Archivo .xlsx requerido para validar.' });
    }

    const { grupos, headerRow, titles } = await parseWorkbook(req.file.buffer);

    let familias = 0;
    let integrantes = 0;
    for (const [, pack] of grupos) {
      familias += 1;
      integrantes += pack.integrantes.length;
    }

    return res.json({
      success: true,
      resumen: {
        grupos: familias,
        integrantes,
        detected_header_row: headerRow,
        detected_titles: titles.map(norm).filter(Boolean),
      },
      preview: Array.from(grupos.values()).slice(0, 3),
    });
  } catch (e) {
    console.error('VALIDATE familias error:', e);
    if (e.isValidation) {
      return res.status(400).json({
        success: false,
        message: e.message,
        errores: e.validationErrors || [],
        detected_header_row: e.detected_header_row,
        detected_titles: e.detected_titles,
      });
    }
    return res
      .status(400)
      .json({ success: false, message: e.message || 'Error validando archivo' });
  }
});

// ==== Endpoint principal ====
// POST /api/familias/import-excel
// FormData: archivo (.xlsx), zona_id (obligatoria)
router.post('/', auth, uploadExcelGate, async (req, res) => {
  const file = req.file;
  const { zona_id } = req.body;

  if (!file) {
    return res
      .status(400)
      .json({ success: false, message: 'Archivo .xlsx requerido' });
  }
  if (!zona_id) {
    return res
      .status(400)
      .json({ success: false, message: 'zona_id es requerida' });
  }

  try {
    // Zona (para código único y FK)
    const [[zona]] = await pool.query(
      'SELECT id, abreviatura, nombre FROM zonas WHERE id = ? AND activo = 1',
      [zona_id]
    );
    if (!zona) {
      return res
        .status(400)
        .json({ success: false, message: 'Zona inválida o inactiva' });
    }

    // Parseo del Excel (común con /validate)
    const { grupos } = await parseWorkbook(file.buffer);

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    let familiasInsertadas = 0;
    let familiasActualizadas = 0;
    let integrantesInsertados = 0;

    try {
      for (const [, pack] of grupos) {
        const { familia, integrantes } = pack;

        // Validación extra defensiva (no debería dispararse si parseWorkbook ya validó)
        if (!familia.direccion || !familia.direccion.trim()) {
          throw new Error(
            `Familia ${familia.nro || ''} sin dirección. Corrige el archivo e intenta nuevamente.`
          );
        }
        const direccion = familia.direccion.trim();

        // código único: <ABREV><NNN>
        const nroPadded = String(familia.nro || '').padStart(3, '0');
        const codigo_unico = `${zona.abreviatura}${nroPadded}`;

        // dependientes = total declarado o cantidad de integrantes detectados
        const totalIntegrantes = familia.total || integrantes.length || 0;

        // UPSERT familia por codigo_unico
        const [existing] = await conn.query(
          'SELECT id FROM familias WHERE codigo_unico = ?',
          [codigo_unico]
        );
        let familia_id;

        if (existing.length) {
          familia_id = existing[0].id;
          await conn.query(
            `UPDATE familias
              SET zona_id=?, direccion=?, nombre_padre=?, nombre_madre=?, dependientes=?, activo=1
              WHERE id=?`,
            [
              zona.id,
              direccion,
              familia.padre || null,
              familia.madre || null,
              totalIntegrantes,
              familia_id,
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
              direccion,
              familia.padre || null,
              familia.madre || null,
              totalIntegrantes,
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
            [
              familia_id,
              it.nombre,
              it.fecha_nacimiento,
              it.relacion,
              it.sexo,
              it.observaciones,
            ]
          );
          integrantesInsertados++;
        }
      }

      await conn.commit();
      conn.release();

      return res.json({
        success: true,
        message: 'Importación completada exitosamente',
        resumen: {
          familiasInsertadas,
          familiasActualizadas,
          integrantesInsertados,
          grupos: grupos.size,
          zona: { id: zona_id },
        },
      });
    } catch (e) {
      await conn.rollback();
      conn.release();
      console.error(
        'IMPORT familias error (TX):',
        e.code || e.name,
        e.sqlMessage || e.message || e
      );
      if (e.isValidation) {
        return res.status(400).json({
          success: false,
          message: e.message,
          errores: e.validationErrors || [],
        });
      }
      return res
        .status(500)
        .json({ success: false, message: 'Error importando familias (transacción)' });
    }
  } catch (e) {
    console.error('IMPORT familias error (outer):', e);
    if (e.isValidation) {
      return res.status(400).json({
        success: false,
        message: e.message,
        errores: e.validationErrors || [],
      });
    }
    return res
      .status(500)
      .json({ success: false, message: 'Error importando familias' });
  }
});

module.exports = router;
