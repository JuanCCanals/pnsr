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

  // Formas familiares que se escriben en los Excel. Antes caian en "otro" y la
  // etiqueta decia OTRO (Cañete, Cuna Matazango, Manchay, San Juan de Lurigancho,
  // 30/10/2026). `norm` ya quito las tildes: MAMÁ llega como MAMA y CUÑADO como CUNADO.
  if (/^(MAMA|MAMI|MAMITA)\b/.test(x)) return 'madre';
  if (/^(PAPA|PAPI|PAPITO)\b/.test(x)) return 'padre';
  if (x.startsWith('ABUELITO')) return 'abuelo';
  if (x.startsWith('ABUELITA')) return 'abuela';
  if (x.startsWith('CUNADO')) return 'cuñado';
  if (x.startsWith('CUNADA')) return 'cuñada';

  // Hijastros y hermanastros ANTES que hijos y hermanos: "HIJASTRO" empieza con
  // "HIJA" y "HERMANASTRO" con "HERMANA", y se leian como mujeres.
  if (x.startsWith('HIJASTRO')) return 'hijastro';
  if (x.startsWith('HIJASTRA')) return 'hijastra';
  if (x.startsWith('HERMANASTRO')) return 'hermano';
  if (x.startsWith('HERMANASTRA')) return 'hermana';

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

  // Padrastros
  if (x.startsWith('PADRASTRO')) return 'padrastro';
  if (x.startsWith('MADRASTRA')) return 'madrastra';

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

// Relaciones que solo admiten un sexo (para detectar "HIJA" con sexo M, etc.)
const REL_MASCULINAS = new Set(['padre', 'hijo', 'abuelo', 'nieto', 'hermano', 'tio', 'sobrino',
  'suegro', 'yerno', 'padrastro', 'hijastro', 'esposo', 'primo', 'cuñado']);
const REL_FEMENINAS = new Set(['madre', 'hija', 'abuela', 'nieta', 'hermana', 'tia', 'sobrina',
  'suegra', 'nuera', 'madrastra', 'hijastra', 'esposa', 'prima', 'cuñada']);

// SEXO: solo M (masculino) o F (femenino), como indica la plantilla. Antes se
// tomaba la primera letra y un archivo llenado con H/M (Hombre/Mujer) se grababa
// al reves sin ningun aviso: en San Borja las mujeres quedaron como hombres y
// los hombres sin sexo (27/10/2026). Cualquier otro valor detiene la importacion.
const sexoDe = (raw) => {
  const s = norm(raw);
  if (s === 'M' || s === 'MASCULINO') return 'M';
  if (s === 'F' || s === 'FEMENINO') return 'F';
  return null;
};

// Procesa edad: devuelve { fecha_nacimiento, edad_texto }
const procesarEdad = (edadRaw) => {
  if (!edadRaw) return { fecha_nacimiento: null, edad_texto: null };
  
  // Guardar edad como texto (tal cual viene)
  const edad_texto = String(edadRaw).trim();
  
  // Intentar calcular fecha solo si es número entero
  const edadNum = Number(edadRaw);
  if (Number.isInteger(edadNum) && edadNum > 0) {
    const anioNac = new Date().getFullYear() - edadNum;
    return { 
      fecha_nacimiento: `${anioNac}-01-01`, 
      edad_texto 
    };
  }
  
  // Si no es número válido (ej: "6 meses"), solo guardamos texto
  return { fecha_nacimiento: null, edad_texto };
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
  // La plantilla "Modelo" repite el encabezado "Nº FAMILIA": la columna 1 es la
  // del responsable y la 7 la de los dependientes. Antes se quedaba la ultima, y
  // las familias SIN dependientes (columna 7 vacia) se fundian en una sola: un
  // archivo de 50 familias se leia como 43 (RIMAC, 21/10/2026). Para el numero de
  // familia se guardan todas esas columnas y en cada fila se usa la primera con valor.
  const colsNro = [];
  titles.forEach((t, i) => {
    const k = headerMap(t);
    if (!k) return;
    if (k === 'NRO_FAMILIA') colsNro.push(i);
    idx[k] = i;
  });
  if (colsNro.length) idx.NRO_FAMILIA = colsNro[0];

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

  // ¿El dependiente es el propio titular repetido? Todas las palabras de su
  // nombre tienen que estar en el nombre del titular ("ELENA" en "ELENA NAVARRO
  // ROSADO" si; "FLOR ROSADO" no).
  const palabras = (s) => new Set(norm(s).split(' ').filter(Boolean));
  const esMismaPersona = (dependiente, titular) => {
    const d = palabras(dependiente), t = palabras(titular);
    return d.size > 0 && t.size > 0 && [...d].every((p) => t.has(p));
  };

  const grupos = new Map();
  // Errores de llenado, uno por fila: se informan todos juntos para corregir el
  // archivo de una sola vez, en lugar de adivinar lo que se quiso decir.
  const erroresFila = [];

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    const leer = (pos) => {
      if (!pos) return '';
      const cell = row.getCell(pos);
      if (!cell || cell.value == null) return '';
      if (typeof cell.value === 'object' && cell.value.text) {
        return String(cell.value.text).trim();
      }
      return String(cell.text || cell.value || '').trim();
    };
    const get = (k) => leer(idx[k]);

    const nros = colsNro.map(leer).filter(Boolean);
    const nro = nros[0] || '';
    const direccion = get('DIRECCION');

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
    const edadRaw = get('EDAD') || null;
    const edadProcesada = procesarEdad(edadRaw);
    const cond = get('CONDICION') || null;
    const sexoRaw = get('SEXO');
    const sexo = sexoDe(sexoRaw);
    const relRaw = get('RELACION');

    // Una fila con datos pero sin Nº de familia antes se descartaba en silencio
    // (sin direccion) o se fundia con otras (con direccion): San Borja, el
    // dependiente "B" (27/10/2026). Ahora se informa.
    if (!nro) {
      if (direccion || padre || madre || nombreInt || relRaw || sexoRaw) {
        erroresFila.push({ row: r, nro: '', nombre: nombreInt, detalles: ['no tiene número de familia'] });
      }
      continue;
    }

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

    // Un PADRE o MADRE entre los dependientes se descartaba SIEMPRE, asumiendo
    // que era el titular repetido. Pero suele ser el padre o la madre del titular
    // (abuelos de los ninos) y se perdia: San Borja, familia 20, "Flor Rosado"
    // (27/10/2026). Solo se omite si es la misma persona que el titular.
    const esTitularRepetido = (rel === 'padre' || rel === 'madre') &&
      [g.familia.padre, g.familia.madre].some((t) => t && esMismaPersona(nombreInt, t));

    const detalles = [];
    if (new Set(nros).size > 1) detalles.push(`tiene dos números de familia distintos (${[...new Set(nros)].join(' y ')})`);
    if (nombreInt && !esTitularRepetido) {
      if (nombreInt.replace(/[^\p{L}]/gu, '').length < 2) detalles.push(`el nombre «${nombreInt}» está incompleto`);
      if (!relRaw) detalles.push('falta la relación (HIJO, HIJA, NIETO...)');
      // Una relacion que no se reconoce se guardaba como "otro" sin aviso: un
      // "HJO" o un "HERMAN" salian como OTRO en la etiqueta. Solo se acepta "otro"
      // si es lo que se escribio.
      else if (rel === 'otro' && !/^OTR[OA]\b/.test(norm(relRaw))) {
        detalles.push(`la relación «${relRaw}» no se reconoce (use HIJO, HIJA, NIETO, MADRE, etc.)`);
      }
      if (!sexoRaw) detalles.push('falta el sexo (M o F)');
      else if (!sexo) detalles.push(`el sexo «${sexoRaw}» no es válido (solo M o F)`);
      else if (relRaw && ((sexo === 'F' && REL_MASCULINAS.has(rel)) || (sexo === 'M' && REL_FEMENINAS.has(rel)))) {
        detalles.push(`la relación es ${norm(relRaw)} pero el sexo es ${sexo}`);
      }
    }
    if (detalles.length) erroresFila.push({ row: r, nro, nombre: nombreInt, detalles });

    if (nombreInt && !esTitularRepetido) {
      g.integrantes.push({
        nombre: nombreInt,
        relacion: rel,
        fecha_nacimiento: edadProcesada.fecha_nacimiento,
        edad_texto: edadProcesada.edad_texto,  // ✅ NUEVO CAMPO
        sexo,
        observaciones: cond || null,
      });
    }
  }

  // ==== VALIDACIONES FINALES ====
  const validationErrors = [];

  for (const e of erroresFila) {
    validationErrors.push({
      type: 'DATO_INVALIDO',
      message: `Fila ${e.row}${e.nro ? ` (familia ${e.nro})` : ''}${e.nombre ? `, ${e.nombre}` : ''}: ${e.detalles.join('; ')}.`,
      nro_familia: e.nro || null,
      row: e.row,
    });
  }

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
      'El archivo tiene datos por corregir (ver el detalle). Corrígelo y vuelve a intentar.'
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

      // ✅ OBTENER MÁXIMO CORRELATIVO DE LA ZONA
      const [maxRows] = await conn.query(`
        SELECT MAX(CAST(SUBSTRING(codigo_unico, LENGTH(?) + 1) AS UNSIGNED)) as max_num
        FROM familias
        WHERE zona_id = ? AND codigo_unico LIKE CONCAT(?, '%')
      `, [zona.abreviatura, zona_id, zona.abreviatura]);

      let siguienteNumero = 1;
      if (maxRows[0]?.max_num) {
        siguienteNumero = maxRows[0].max_num + 1;
      }

      console.log(`📊 Zona ${zona.nombre} (${zona.abreviatura}): Siguiente número = ${siguienteNumero}`);

      for (const [, pack] of grupos) {
        const { familia, integrantes } = pack;

        // Validación extra defensiva (no debería dispararse si parseWorkbook ya validó)
        if (!familia.direccion || !familia.direccion.trim()) {
          throw new Error(
            `Familia ${familia.nro || ''} sin dirección. Corrige el archivo e intenta nuevamente.`
          );
        }
        const direccion = familia.direccion.trim();

        // ✅ CÓDIGO ÚNICO AUTO-INCREMENTADO (ignora familia.nro del Excel)
        const nroPadded = String(siguienteNumero).padStart(3, '0');
        const codigo_unico = `${zona.abreviatura}${nroPadded}`;

        // Log para debug
        console.log(`  → Familia #${siguienteNumero}: ${codigo_unico}`);

        // Incrementar para la próxima familia
        siguienteNumero++;

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

        // === Asegurar caja asociada a la familia ===
        const [cajas] = await conn.query(
          'SELECT id, codigo, estado FROM cajas WHERE familia_id = ? LIMIT 1',
          [familia_id]
        );

        if (cajas.length) {
          const caja = cajas[0];
          const nuevoCodigo = caja.codigo || codigo_unico;
          const nuevoEstado = caja.estado || 'disponible';

          if (nuevoCodigo !== caja.codigo || nuevoEstado !== caja.estado) {
            await conn.query(
              'UPDATE cajas SET codigo = ?, estado = ? WHERE id = ?',
              [nuevoCodigo, nuevoEstado, caja.id]
            );
          }
        } else {
          await conn.query(
            'INSERT INTO cajas (codigo, familia_id, estado) VALUES (?,?,?)',
            [codigo_unico, familia_id, 'disponible']
          );
        }
        // === FIN asegurar caja ===

        // Integrantes (hijos/hijas/otros)
        for (const it of integrantes) {
          await conn.query(
            `INSERT INTO integrantes_familia (familia_id, nombre, fecha_nacimiento, edad_texto, relacion, sexo, observaciones)
              VALUES (?,?,?,?,?,?,?)`,
            [
              familia_id,
              it.nombre,
              it.fecha_nacimiento,
              it.edad_texto || null,  // ✅ NUEVO CAMPO
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
// Expuesta para poder probar la lectura de un Excel sin pasar por HTTP ni la BD.
module.exports.parseWorkbook = parseWorkbook;
