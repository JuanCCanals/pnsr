const express = require('express');
const router = express.Router();
const multer = require('multer');
//const XLSX = require('xlsx');
const pool = require('../config/db'); // ✅ Usar pool centralizado
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'familias-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Middleware de autenticación importado desde ../middlewares/auth.js
// Middleware de autorización importado desde ../middlewares/authorizePermission.js

// Función para generar código único de familia
const generarCodigoFamilia = async (zonaAbreviatura, numeroFamilia) => {
  const numero = numeroFamilia.toString().padStart(3, '0');
  return `${zonaAbreviatura}${numero}`;
};

// Función para calcular fecha de nacimiento desde edad
const calcularFechaNacimiento = (edad) => {
  if (!edad || isNaN(edad)) return null;
  const fechaActual = new Date();
  const anioNacimiento = fechaActual.getFullYear() - parseInt(edad);
  return `${anioNacimiento}-01-01`; // Aproximación al 1 de enero
};

// ==================== RUTAS DE FAMILIAS ====================

// Obtener todas las familias
router.get('/', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const { zona_id, activo, search, page = 1, limit = 50 } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (zona_id) {
      whereConditions.push('f.zona_id = ?');
      queryParams.push(zona_id);
    }
    
    if (activo !== undefined) {
      whereConditions.push('f.activo = ?');
      queryParams.push(activo === 'true' ? 1 : 0);
    }
    
    if (search) {
      whereConditions.push(`(
        f.codigo_unico LIKE ? OR 
        f.nombre_padre LIKE ? OR 
        f.nombre_madre LIKE ? OR 
        f.direccion LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Filtro por rango de códigos
    if (req.query.codigo_desde && req.query.codigo_hasta) {
      whereConditions.push('f.codigo_unico >= ? AND f.codigo_unico <= ?');
      queryParams.push(req.query.codigo_desde, req.query.codigo_hasta);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Consulta principal con paginación
    const offset = (page - 1) * limit;

const [rows] = await pool.execute(`
  SELECT 
    f.id,
    f.codigo_unico,
    f.nombre_padre,
    f.nombre_madre,
    f.direccion,
    f.zona_id,
    f.telefono,
    f.observaciones,
    f.activo,
    f.created_at,
    f.updated_at,
    z.nombre as zona_nombre,
    z.abreviatura as zona_abreviatura,
    0 as total_integrantes,
    0 as total_cajas
  FROM familias f
  LEFT JOIN zonas z ON f.zona_id = z.id
  ${whereClause}
  ORDER BY f.codigo_unico
  LIMIT ? OFFSET ?
`, [...queryParams, parseInt(limit), parseInt(offset)]);

    // Contar total de registros
    const [countRows] = await pool.execute(`
      SELECT COUNT(DISTINCT f.id) as total
      FROM familias f
      LEFT JOIN zonas z ON f.zona_id = z.id
      ${whereClause}
    `, queryParams);

    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener familias:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});



// Obtener estadísticas de familias
router.get('/stats', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM familias');
    const [activasRows] = await pool.execute('SELECT COUNT(*) as activas FROM familias WHERE activo = 1');
    const [integrantesRows] = await pool.execute(`
      SELECT COUNT(*) as total_integrantes 
      FROM integrantes_familia inf 
      INNER JOIN familias f ON inf.familia_id = f.id 
      WHERE f.activo = 1
    `);
    const [cajasRows] = await pool.execute(`
      SELECT COUNT(*) as total_cajas 
      FROM cajas c 
      INNER JOIN familias f ON c.familia_id = f.id 
      WHERE f.activo = 1
    `);
    const [zonasRows] = await pool.execute(`
      SELECT COUNT(DISTINCT f.zona_id) as zonas_con_familias 
      FROM familias f 
      WHERE f.activo = 1
    `);

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        activas: activasRows[0].activas,
        total_integrantes: integrantesRows[0].total_integrantes,
        total_cajas: cajasRows[0].total_cajas,
        zonas_con_familias: zonasRows[0].zonas_con_familias,
        promedio_integrantes: activasRows[0].activas > 0 ? 
          (integrantesRows[0].total_integrantes / activasRows[0].activas).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// === ETIQUETAS POR ZONA (bulk) ===
// DEBE IR ANTES de `/:id` para que Express no lo capture como {id: "labels"}
router.get('/labels/bulk', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const { zona_id } = req.query;
    if (!zona_id) {
      return res.status(400).json({ success:false, error:'zona_id requerido' });
    }

    // Trae familias activas por zona
    const [familiasRows] = await pool.execute(`
      SELECT 
        f.id, f.codigo_unico, f.nombre_padre, f.nombre_madre, f.direccion,
        f.telefono, f.observaciones, f.zona_id,
        z.nombre AS zona_nombre, z.abreviatura AS zona_abreviatura
      FROM familias f
      LEFT JOIN zonas z ON f.zona_id = z.id
      WHERE f.zona_id = ? AND f.activo = 1
      ORDER BY f.codigo_unico
    `, [zona_id]);

    if (!familiasRows.length) {
      return res.json({ success:true, data: [] });
    }

    // Obtener integrantes para todas estas familias de una sola vez
    const ids = familiasRows.map(f => f.id);
    const placeholders = ids.map(() => '?').join(',');
    const [integrantesRows] = await pool.execute(`
      SELECT 
        id, familia_id, nombre, fecha_nacimiento, relacion, sexo, observaciones
      FROM integrantes_familia
      WHERE familia_id IN (${placeholders})
      ORDER BY 
        CASE relacion 
          WHEN 'padre' THEN 1 
          WHEN 'madre' THEN 2 
          ELSE 3 
        END,
        fecha_nacimiento DESC
    `, ids);

    // Agrupar integrantes por familia
    const integByFam = new Map();
    for (const it of integrantesRows) {
      if (!integByFam.has(it.familia_id)) integByFam.set(it.familia_id, []);
      integByFam.get(it.familia_id).push({
        ...it,
        // Si quieres devolver edad calculada aquí:
        edad: it.fecha_nacimiento ? 
          Math.max(0, new Date().getFullYear() - new Date(it.fecha_nacimiento).getFullYear()) : null,
      });
    }

    // Adjuntar integrantes
    const data = familiasRows.map(f => ({
      ...f,
      integrantes: integByFam.get(f.id) || []
    }));

    res.json({ success:true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, error:'Error listando etiquetas por zona' });
  }
});


// ========= CAJAS: Listado paginado con filtros =========
// GET /api/familias/cajas?search=&estado=&zona_id=&page=1&limit=20
// IMPORTANTE: debe estar ANTES de /:id para que Express no lo confunda
router.get('/cajas', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const search  = (req.query.search || '').trim();
    const estado  = (req.query.estado || '').trim();
    const zona_id = (req.query.zona_id || '').trim();
    const page    = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit   = Math.min(200, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset  = (page - 1) * limit;

    const where = [];
    const args  = [];

    if (search) {
      where.push(`(c.codigo LIKE ? OR f.codigo_unico LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`);
    }
    if (estado)  { where.push(`c.estado = ?`);    args.push(estado); }
    if (zona_id) { where.push(`f.zona_id = ?`);   args.push(zona_id); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM cajas c
       LEFT JOIN familias f ON f.id = c.familia_id
       ${whereSQL}`, args
    );

    const [rows] = await pool.query(
      `SELECT c.id, c.codigo, c.estado, c.benefactor_id, c.fecha_asignacion,
              c.fecha_entrega, c.fecha_devolucion,
              f.codigo_unico, f.zona_id,
              z.nombre AS zona_nombre,
              b.nombre AS benefactor_nombre
       FROM cajas c
       LEFT JOIN familias f ON f.id = c.familia_id
       LEFT JOIN zonas z ON z.id = f.zona_id
       LEFT JOIN benefactores b ON b.id = c.benefactor_id
       ${whereSQL}
       ORDER BY c.codigo ASC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages }
    });
  } catch (e) {
    console.error('GET /familias/cajas:', e);
    res.status(500).json({ success: false, error: 'Error listando cajas' });
  }
});


// Obtener una familia por ID con integrantes
router.get('/:id', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener datos de la familia
    const [familiaRows] = await pool.execute(`
      SELECT 
        f.*,
        z.nombre as zona_nombre,
        z.abreviatura as zona_abreviatura
      FROM familias f
      LEFT JOIN zonas z ON f.zona_id = z.id
      WHERE f.id = ?
    `, [id]);

    if (familiaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Familia no encontrada'
      });
    }

    const familia = familiaRows[0];

    // Obtener integrantes de la familia
    const [integrantesRows] = await pool.execute(`
      SELECT id, familia_id, nombre, fecha_nacimiento, edad_texto, relacion, sexo, observaciones
      FROM integrantes_familia 
      WHERE familia_id = ? 
      ORDER BY 
        CASE relacion 
          WHEN 'padre' THEN 1 
          WHEN 'madre' THEN 2 
          ELSE 3 
        END,
        fecha_nacimiento DESC
    `, [id]);

    // Obtener cajas asociadas
    const [cajasRows] = await pool.execute(`
      SELECT c.*, b.nombre as benefactor_nombre
      FROM cajas c
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      WHERE c.familia_id = ?
      ORDER BY c.created_at DESC
    `, [id]);

    familia.integrantes = integrantesRows;
    familia.cajas = cajasRows;

    res.json({
      success: true,
      data: familia
    });
  } catch (error) {
    console.error('Error al obtener familia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nueva familia
router.post('/', authenticateToken, authorizePermission('familias.crear'), async (req, res) => {
  try {
    const { 
      nombre_padre, 
      nombre_madre, 
      direccion, 
      zona_id, 
      telefono, 
      observaciones, 
      integrantes = [] 
    } = req.body;

    // Validaciones básicas
    const errors = [];
    if (!direccion || direccion.trim().length < 5) {
      errors.push({ field: 'direccion', message: 'La dirección debe tener al menos 5 caracteres' });
    }
    if (!zona_id) {
      errors.push({ field: 'zona_id', message: 'La zona es requerida' });
    }
    if (!nombre_padre && !nombre_madre) {
      errors.push({ field: 'general', message: 'Debe especificar al menos el nombre del padre o la madre' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar que la zona existe
    const [zonaRows] = await pool.execute(
      'SELECT id, abreviatura FROM zonas WHERE id = ? AND activo = 1',
      [zona_id]
    );

    if (zonaRows.length === 0) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'zona_id', message: 'La zona especificada no existe o está inactiva' }],
        message: 'Zona inválida'
      });
    }

    const zona = zonaRows[0];

    // Generar código único
    const [maxCodigoRows] = await pool.execute(`
      SELECT MAX(CAST(SUBSTRING(codigo_unico, LENGTH(?) + 1) AS UNSIGNED)) as max_numero
      FROM familias 
      WHERE codigo_unico LIKE CONCAT(?, '%')
    `, [zona.abreviatura, zona.abreviatura]);

    const siguienteNumero = (maxCodigoRows[0].max_numero || 0) + 1;
    const codigoUnico = await generarCodigoFamilia(zona.abreviatura, siguienteNumero);

    // Iniciar transacción
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insertar familia
      const [familiaResult] = await connection.execute(
        'INSERT INTO familias (codigo_unico, nombre_padre, nombre_madre, direccion, zona_id, telefono, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [codigoUnico, nombre_padre?.trim() || null, nombre_madre?.trim() || null, direccion.trim(), zona_id, telefono?.trim() || null, observaciones?.trim() || null]
      );

      const familiaId = familiaResult.insertId;

      // Insertar integrantes si se proporcionaron
      for (const integrante of integrantes) {
        if (integrante.nombre && integrante.relacion) {
          const fechaNacimiento = integrante.fecha_nacimiento || calcularFechaNacimiento(integrante.edad);
          
          await connection.execute(
            'INSERT INTO integrantes_familia (familia_id, nombre, fecha_nacimiento, relacion, sexo, observaciones) VALUES (?, ?, ?, ?, ?, ?)',
            [familiaId, integrante.nombre.trim(), fechaNacimiento, integrante.relacion, (integrante.sexo === 'M' || integrante.sexo === 'F') ? integrante.sexo : null, integrante.observaciones?.trim() || null]
          );
        }
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        data: {
          id: familiaId,
          codigo_unico: codigoUnico,
          nombre_padre: nombre_padre?.trim() || null,
          nombre_madre: nombre_madre?.trim() || null,
          direccion: direccion.trim(),
          zona_id,
          telefono: telefono?.trim() || null,
          observaciones: observaciones?.trim() || null
        },
        message: 'Familia creada exitosamente'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error al crear familia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Importar familias desde Excel
router.post('/import-excel', authenticateToken, authorizePermission('familias.crear'), upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó archivo Excel'
      });
    }

    const { zona_id_default, sobrescribir = false } = req.body;

    // Leer archivo Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Encontrar fila de encabezados (buscar "Nº FAMILIA")
    let headerRowIndex = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].some(cell => cell && cell.toString().includes('FAMILIA'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron encabezados válidos en el archivo Excel'
      });
    }

    // Procesar datos desde la fila siguiente a los encabezados
    const familias = new Map();
    const errores = [];
    let filasProcessadas = 0;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 14) continue;

      filasProcessadas++;

      try {
        // Extraer datos de familia (columnas 0-6)
        const numeroFamilia = row[0]?.toString().trim();
        const zonaAbrev = row[1]?.toString().trim();
        const nombrePadre = row[2]?.toString().trim();
        const apellidosPadre = row[3]?.toString().trim();
        const nombreMadre = row[4]?.toString().trim();
        const apellidosMadre = row[5]?.toString().trim();
        const direccion = row[6]?.toString().trim();

        // Extraer datos de integrante (columnas 8-14)
        const relacion = row[10]?.toString().trim();
        const nombreIntegrante = row[11]?.toString().trim();
        const sexo = row[12]?.toString().trim();
        const edad = row[13] ? parseInt(row[13]) : null;
        const total = row[14] ? parseInt(row[14]) : null;

        if (!numeroFamilia || !direccion) continue;

        // Crear o actualizar familia en el Map
        const familiaKey = `${zonaAbrev}-${numeroFamilia}`;
        
        if (!familias.has(familiaKey)) {
          familias.set(familiaKey, {
            numero_familia: numeroFamilia,
            zona_abreviatura: zonaAbrev,
            nombre_padre: nombrePadre && apellidosPadre ? `${nombrePadre} ${apellidosPadre}` : null,
            nombre_madre: nombreMadre && apellidosMadre ? `${nombreMadre} ${apellidosMadre}` : null,
            direccion: direccion,
            total_integrantes: total,
            integrantes: []
          });
        }

        // Agregar integrante si tiene datos válidos
        if (nombreIntegrante && relacion) {
          familias.get(familiaKey).integrantes.push({
            nombre: nombreIntegrante,
            relacion: relacion.toLowerCase(),
            sexo: sexo?.toUpperCase(),
            edad: edad,
            fecha_nacimiento: calcularFechaNacimiento(edad)
          });
        }

      } catch (error) {
        errores.push(`Fila ${i + 1}: ${error.message}`);
      }
    }

    // Procesar familias e insertar en base de datos
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let familiasCreadas = 0;
    let integrantesCreados = 0;

    try {
      for (const [familiaKey, familiaData] of familias) {
        // Buscar zona por abreviatura
        const [zonaRows] = await connection.execute(
          'SELECT id, abreviatura FROM zonas WHERE abreviatura = ? AND activo = 1',
          [familiaData.zona_abreviatura]
        );

        let zonaId;
        if (zonaRows.length === 0) {
          if (zona_id_default) {
            zonaId = zona_id_default;
          } else {
            errores.push(`Familia ${familiaKey}: Zona '${familiaData.zona_abreviatura}' no encontrada`);
            continue;
          }
        } else {
          zonaId = zonaRows[0].id;
        }

        // Generar código único
        const [maxCodigoRows] = await connection.execute(`
          SELECT MAX(CAST(SUBSTRING(codigo_unico, LENGTH(?) + 1) AS UNSIGNED)) as max_numero
          FROM familias 
          WHERE codigo_unico LIKE CONCAT(?, '%')
        `, [familiaData.zona_abreviatura, familiaData.zona_abreviatura]);

        const siguienteNumero = (maxCodigoRows[0].max_numero || 0) + 1;
        const codigoUnico = await generarCodigoFamilia(familiaData.zona_abreviatura, siguienteNumero);

        // Verificar si ya existe
        const [existeRows] = await connection.execute(
          'SELECT id FROM familias WHERE codigo_unico = ?',
          [codigoUnico]
        );

        if (existeRows.length > 0 && !sobrescribir) {
          errores.push(`Familia ${familiaKey}: Ya existe con código ${codigoUnico}`);
          continue;
        }

        // Insertar o actualizar familia
        let familiaId;
        if (existeRows.length > 0 && sobrescribir) {
          familiaId = existeRows[0].id;
          await connection.execute(
            'UPDATE familias SET nombre_padre = ?, nombre_madre = ?, direccion = ?, zona_id = ? WHERE id = ?',
            [familiaData.nombre_padre, familiaData.nombre_madre, familiaData.direccion, zonaId, familiaId]
          );
          
          // Eliminar integrantes existentes
          await connection.execute('DELETE FROM integrantes_familia WHERE familia_id = ?', [familiaId]);
        } else {
          const [familiaResult] = await connection.execute(
            'INSERT INTO familias (codigo_unico, nombre_padre, nombre_madre, direccion, zona_id) VALUES (?, ?, ?, ?, ?)',
            [codigoUnico, familiaData.nombre_padre, familiaData.nombre_madre, familiaData.direccion, zonaId]
          );
          familiaId = familiaResult.insertId;
          familiasCreadas++;
        }

        // Insertar integrantes
        for (const integrante of familiaData.integrantes) {
          await connection.execute(
            'INSERT INTO integrantes_familia (familia_id, nombre, fecha_nacimiento, relacion) VALUES (?, ?, ?, ?)',
            [familiaId, integrante.nombre, integrante.fecha_nacimiento, integrante.relacion]
          );
          integrantesCreados++;
        }
      }

      await connection.commit();

      // Eliminar archivo temporal
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        data: {
          familias_procesadas: familias.size,
          familias_creadas: familiasCreadas,
          integrantes_creados: integrantesCreados,
          filas_procesadas: filasProcessadas,
          errores: errores
        },
        message: `Importación completada: ${familiasCreadas} familias creadas, ${integrantesCreados} integrantes`
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error al importar Excel:', error);
    
    // Eliminar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar el archivo'
    });
  }
});

// Actualizar familia
router.put('/:id', authenticateToken, authorizePermission('familias.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_padre, nombre_madre, direccion, zona_id, telefono, observaciones, activo } = req.body;

    // Verificar si la familia existe
    const [existingFamilia] = await pool.execute(
      'SELECT id FROM familias WHERE id = ?',
      [id]
    );

    if (existingFamilia.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Familia no encontrada'
      });
    }

    // Preparar campos para actualizar
    let updateFields = [];
    let updateValues = [];

    if (nombre_padre !== undefined) {
      updateFields.push('nombre_padre = ?');
      updateValues.push(nombre_padre?.trim() || null);
    }
    if (nombre_madre !== undefined) {
      updateFields.push('nombre_madre = ?');
      updateValues.push(nombre_madre?.trim() || null);
    }
    if (direccion) {
      updateFields.push('direccion = ?');
      updateValues.push(direccion.trim());
    }
    if (zona_id) {
      updateFields.push('zona_id = ?');
      updateValues.push(zona_id);
    }
    if (telefono !== undefined) {
      updateFields.push('telefono = ?');
      updateValues.push(telefono?.trim() || null);
    }
    if (observaciones !== undefined) {
      updateFields.push('observaciones = ?');
      updateValues.push(observaciones?.trim() || null);
    }
    if (activo !== undefined) {
      updateFields.push('activo = ?');
      updateValues.push(activo);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE familias SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    res.json({
      success: true,
      message: 'Familia actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar familia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Cambiar estado de familia (activar/desactivar)
router.patch('/:id/toggle-status', authenticateToken, authorizePermission('familias.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    const [familiaRows] = await pool.execute(
      'SELECT activo FROM familias WHERE id = ?',
      [id]
    );

    if (familiaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Familia no encontrada'
      });
    }

    const nuevoEstado = !familiaRows[0].activo;

    // Actualizar estado
    await pool.execute(
      'UPDATE familias SET activo = ? WHERE id = ?',
      [nuevoEstado, id]
    );

    res.json({
      success: true,
      message: `Familia ${nuevoEstado ? 'activada' : 'desactivada'} exitosamente`
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar familia
router.delete('/:id', authenticateToken, authorizePermission('familias.eliminar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si la familia existe
    const [existingFamilia] = await pool.execute(
      'SELECT id FROM familias WHERE id = ?',
      [id]
    );

    if (existingFamilia.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Familia no encontrada'
      });
    }

    // Verificar si hay cajas asociadas
    const [cajasAsociadas] = await pool.execute(
      'SELECT COUNT(*) as total FROM cajas WHERE familia_id = ?',
      [id]
    );

    if (cajasAsociadas[0].total > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar la familia porque tiene cajas asociadas'
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Eliminar integrantes
      await connection.execute(
        'DELETE FROM integrantes_familia WHERE familia_id = ?',
        [id]
      );

      // Eliminar familia
      await connection.execute(
        'DELETE FROM familias WHERE id = ?',
        [id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Familia eliminada exitosamente'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error al eliminar familia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener integrantes de una familia
router.get('/:id/integrantes', authenticateToken, authorizePermission('familias.leer'), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT id, familia_id, nombre, fecha_nacimiento, edad_texto, relacion, sexo, observaciones
      FROM integrantes_familia 
      WHERE familia_id = ? 
      ORDER BY 
        CASE relacion 
          WHEN 'padre' THEN 1 
          WHEN 'madre' THEN 2 
          ELSE 3 
        END,
        fecha_nacimiento DESC
    `, [id]);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener integrantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Agregar integrante a familia
router.post('/:id/integrantes', authenticateToken, authorizePermission('familias.crear'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, fecha_nacimiento, relacion, sexo, observaciones } = req.body;

    // Validaciones
    if (!nombre || !relacion) {
      return res.status(400).json({
        success: false,
        error: 'Nombre y relación son requeridos'
      });
    }

    // Verificar que la familia existe
    const [familiaRows] = await pool.execute(
      'SELECT id FROM familias WHERE id = ?',
      [id]
    );

    if (familiaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Familia no encontrada'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO integrantes_familia (familia_id, nombre, fecha_nacimiento, relacion, sexo, observaciones) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nombre.trim(), fecha_nacimiento || null, relacion, (sexo === 'M' || sexo === 'F') ? sexo : null, observaciones?.trim() || null]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        familia_id: id,
        nombre: nombre.trim(),
        fecha_nacimiento: fecha_nacimiento || null,
        relacion,
        observaciones: observaciones?.trim() || null
      },
      message: 'Integrante agregado exitosamente'
    });

  } catch (error) {
    console.error('Error al agregar integrante:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;

