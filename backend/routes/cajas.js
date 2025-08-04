const express = require('express');
const router = express.Router();

// Función para obtener el pool de conexiones
const getPool = () => {
  const mysql = require('mysql2/promise');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pnsr_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  return mysql.createPool(dbConfig);
};

const pool = getPool();

// Middleware de autenticación simplificado
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token de acceso requerido'
      });
    }

    req.user = { id: 1, rol: 'admin' };
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Token inválido'
    });
  }
};

// Función para generar código de caja
const generarCodigoCaja = async () => {
  const anioActual = new Date().getFullYear();
  const [maxCodigoRows] = await pool.execute(`
    SELECT MAX(CAST(SUBSTRING(codigo, -4) AS UNSIGNED)) as max_numero
    FROM cajas 
    WHERE codigo LIKE ?
  `, [`CAJA-${anioActual}-%`]);

  const siguienteNumero = (maxCodigoRows[0].max_numero || 0) + 1;
  return `CAJA-${anioActual}-${siguienteNumero.toString().padStart(4, '0')}`;
};

// ==================== RUTAS DE CAJAS ====================

// Obtener todas las cajas con filtros
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      estado, 
      zona_id, 
      benefactor_id, 
      search, 
      fecha_desde, 
      fecha_hasta,
      page = 1, 
      limit = 50 
    } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (estado) {
      whereConditions.push('c.estado = ?');
      queryParams.push(estado);
    }
    
    if (zona_id) {
      whereConditions.push('f.zona_id = ?');
      queryParams.push(zona_id);
    }
    
    if (benefactor_id) {
      whereConditions.push('c.benefactor_id = ?');
      queryParams.push(benefactor_id);
    }
    
    if (search) {
      whereConditions.push(`(
        c.codigo LIKE ? OR 
        f.codigo_unico LIKE ? OR 
        f.nombre_padre LIKE ? OR 
        f.nombre_madre LIKE ? OR
        b.nombre LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (fecha_desde) {
      whereConditions.push('DATE(c.created_at) >= ?');
      queryParams.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      whereConditions.push('DATE(c.created_at) <= ?');
      queryParams.push(fecha_hasta);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Consulta principal con paginación
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(`
      SELECT 
        c.id,
        c.codigo,
        c.familia_id,
        c.benefactor_id,
        c.estado,
        c.fecha_asignacion,
        c.fecha_entrega,
        c.fecha_devolucion,
        c.observaciones,
        c.created_at,
        c.updated_at,
        f.codigo_unico as familia_codigo,
        f.nombre_padre,
        f.nombre_madre,
        f.direccion as familia_direccion,
        z.nombre as zona_nombre,
        z.abreviatura as zona_abreviatura,
        b.nombre as benefactor_nombre,
        b.telefono as benefactor_telefono,
        b.email as benefactor_email
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, parseInt(limit), parseInt(offset)]);

    // Contar total de registros
    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
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
    console.error('Error al obtener cajas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de cajas
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM cajas');
    
    const [estadosRows] = await pool.execute(`
      SELECT 
        estado,
        COUNT(*) as cantidad
      FROM cajas 
      GROUP BY estado
    `);

    const [benefactoresRows] = await pool.execute(`
      SELECT COUNT(DISTINCT benefactor_id) as total_benefactores 
      FROM cajas 
      WHERE benefactor_id IS NOT NULL
    `);

    const [zonasRows] = await pool.execute(`
      SELECT 
        z.nombre as zona_nombre,
        z.abreviatura,
        COUNT(c.id) as total_cajas
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      GROUP BY z.id, z.nombre, z.abreviatura
      ORDER BY total_cajas DESC
    `);

    const [ultimasRows] = await pool.execute(`
      SELECT 
        c.codigo,
        c.estado,
        c.created_at,
        f.codigo_unico as familia_codigo,
        b.nombre as benefactor_nombre
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    // Procesar estadísticas por estado
    const estadisticas = {
      disponible: 0,
      asignada: 0,
      entregada: 0,
      devuelta: 0
    };

    estadosRows.forEach(row => {
      estadisticas[row.estado] = row.cantidad;
    });

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        por_estado: estadisticas,
        total_benefactores: benefactoresRows[0].total_benefactores,
        por_zona: zonasRows,
        ultimas_cajas: ultimasRows,
        porcentaje_asignadas: totalRows[0].total > 0 ? 
          ((estadisticas.asignada + estadisticas.entregada + estadisticas.devuelta) / totalRows[0].total * 100).toFixed(1) : 0
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

// Obtener una caja por ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        c.*,
        f.codigo_unico as familia_codigo,
        f.nombre_padre,
        f.nombre_madre,
        f.direccion as familia_direccion,
        f.telefono as familia_telefono,
        f.observaciones as familia_observaciones,
        z.nombre as zona_nombre,
        z.abreviatura as zona_abreviatura,
        b.nombre as benefactor_nombre,
        b.dni as benefactor_dni,
        b.telefono as benefactor_telefono,
        b.email as benefactor_email,
        b.direccion as benefactor_direccion
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      WHERE c.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    // Obtener integrantes de la familia
    const [integrantesRows] = await pool.execute(`
      SELECT * FROM integrantes_familia 
      WHERE familia_id = ? 
      ORDER BY 
        CASE relacion 
          WHEN 'padre' THEN 1 
          WHEN 'madre' THEN 2 
          ELSE 3 
        END,
        fecha_nacimiento DESC
    `, [rows[0].familia_id]);

    const caja = rows[0];
    caja.familia_integrantes = integrantesRows;

    res.json({
      success: true,
      data: caja
    });
  } catch (error) {
    console.error('Error al obtener caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nueva caja
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { familia_id, observaciones } = req.body;

    // Validaciones básicas
    if (!familia_id) {
      return res.status(400).json({
        success: false,
        error: 'El ID de familia es requerido'
      });
    }

    // Verificar que la familia existe
    const [familiaRows] = await pool.execute(
      'SELECT id, codigo_unico FROM familias WHERE id = ? AND activo = 1',
      [familia_id]
    );

    if (familiaRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'La familia especificada no existe o está inactiva'
      });
    }

    // Verificar si ya existe una caja para esta familia
    const [cajaExistente] = await pool.execute(
      'SELECT id FROM cajas WHERE familia_id = ?',
      [familia_id]
    );

    if (cajaExistente.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe una caja para esta familia'
      });
    }

    // Generar código único
    const codigo = await generarCodigoCaja();

    // Insertar caja
    const [result] = await pool.execute(
      'INSERT INTO cajas (codigo, familia_id, estado, observaciones) VALUES (?, ?, ?, ?)',
      [codigo, familia_id, 'disponible', observaciones?.trim() || null]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        codigo,
        familia_id,
        estado: 'disponible',
        observaciones: observaciones?.trim() || null
      },
      message: 'Caja creada exitosamente'
    });

  } catch (error) {
    console.error('Error al crear caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear cajas masivamente para todas las familias activas sin caja
router.post('/crear-masivo', authenticateToken, async (req, res) => {
  try {
    const { zona_id, sobrescribir = false } = req.body;

    let whereCondition = 'f.activo = 1';
    let queryParams = [];

    if (zona_id) {
      whereCondition += ' AND f.zona_id = ?';
      queryParams.push(zona_id);
    }

    // Obtener familias sin caja
    let query = `
      SELECT f.id, f.codigo_unico
      FROM familias f
      LEFT JOIN cajas c ON f.id = c.familia_id
      WHERE ${whereCondition}
    `;

    if (!sobrescribir) {
      query += ' AND c.id IS NULL';
    }

    const [familiasRows] = await pool.execute(query, queryParams);

    if (familiasRows.length === 0) {
      return res.json({
        success: true,
        data: {
          cajas_creadas: 0,
          familias_procesadas: 0
        },
        message: 'No hay familias sin cajas para procesar'
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let cajasCreadas = 0;

    try {
      for (const familia of familiasRows) {
        // Si sobrescribir está activado, eliminar caja existente
        if (sobrescribir) {
          await connection.execute(
            'DELETE FROM cajas WHERE familia_id = ?',
            [familia.id]
          );
        }

        // Generar código único
        const codigo = await generarCodigoCaja();

        // Insertar nueva caja
        await connection.execute(
          'INSERT INTO cajas (codigo, familia_id, estado) VALUES (?, ?, ?)',
          [codigo, familia.id, 'disponible']
        );

        cajasCreadas++;
      }

      await connection.commit();

      res.json({
        success: true,
        data: {
          cajas_creadas: cajasCreadas,
          familias_procesadas: familiasRows.length
        },
        message: `${cajasCreadas} cajas creadas exitosamente`
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error al crear cajas masivamente:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Asignar caja a benefactor
router.post('/:id/asignar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { benefactor_id, observaciones } = req.body;

    if (!benefactor_id) {
      return res.status(400).json({
        success: false,
        error: 'El ID del benefactor es requerido'
      });
    }

    // Verificar que la caja existe y está disponible
    const [cajaRows] = await pool.execute(
      'SELECT id, estado FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    if (cajaRows[0].estado !== 'disponible') {
      return res.status(400).json({
        success: false,
        error: 'La caja no está disponible para asignación'
      });
    }

    // Verificar que el benefactor existe
    const [benefactorRows] = await pool.execute(
      'SELECT id FROM benefactores WHERE id = ? AND activo = 1',
      [benefactor_id]
    );

    if (benefactorRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El benefactor especificado no existe o está inactivo'
      });
    }

    // Actualizar caja
    await pool.execute(
      'UPDATE cajas SET benefactor_id = ?, estado = ?, fecha_asignacion = NOW(), observaciones = ? WHERE id = ?',
      [benefactor_id, 'asignada', observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Caja asignada exitosamente al benefactor'
    });

  } catch (error) {
    console.error('Error al asignar caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Marcar caja como entregada a benefactor
router.post('/:id/entregar-benefactor', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    // Verificar que la caja existe y está asignada
    const [cajaRows] = await pool.execute(
      'SELECT id, estado, benefactor_id FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    if (cajaRows[0].estado !== 'asignada') {
      return res.status(400).json({
        success: false,
        error: 'La caja debe estar asignada para poder entregarla'
      });
    }

    if (!cajaRows[0].benefactor_id) {
      return res.status(400).json({
        success: false,
        error: 'La caja no tiene benefactor asignado'
      });
    }

    // Actualizar caja
    await pool.execute(
      'UPDATE cajas SET estado = ?, fecha_entrega = NOW(), observaciones = ? WHERE id = ?',
      ['entregada', observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Caja marcada como entregada al benefactor'
    });

  } catch (error) {
    console.error('Error al entregar caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Marcar caja como devuelta por benefactor
router.post('/:id/devolver', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    // Verificar que la caja existe y está entregada
    const [cajaRows] = await pool.execute(
      'SELECT id, estado FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    if (cajaRows[0].estado !== 'entregada') {
      return res.status(400).json({
        success: false,
        error: 'La caja debe estar entregada para poder marcarla como devuelta'
      });
    }

    // Actualizar caja
    await pool.execute(
      'UPDATE cajas SET estado = ?, fecha_devolucion = NOW(), observaciones = ? WHERE id = ?',
      ['devuelta', observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Caja marcada como devuelta por benefactor'
    });

  } catch (error) {
    console.error('Error al devolver caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Liberar caja (quitar asignación)
router.post('/:id/liberar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    // Verificar que la caja existe
    const [cajaRows] = await pool.execute(
      'SELECT id, estado FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    if (cajaRows[0].estado === 'disponible') {
      return res.status(400).json({
        success: false,
        error: 'La caja ya está disponible'
      });
    }

    // Liberar caja
    await pool.execute(
      `UPDATE cajas SET 
        benefactor_id = NULL, 
        estado = 'disponible', 
        fecha_asignacion = NULL, 
        fecha_entrega = NULL, 
        fecha_devolucion = NULL,
        observaciones = ? 
      WHERE id = ?`,
      [observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Caja liberada exitosamente'
    });

  } catch (error) {
    console.error('Error al liberar caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar observaciones de caja
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    // Verificar que la caja existe
    const [cajaRows] = await pool.execute(
      'SELECT id FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    // Actualizar observaciones
    await pool.execute(
      'UPDATE cajas SET observaciones = ? WHERE id = ?',
      [observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Caja actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar caja
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la caja existe
    const [cajaRows] = await pool.execute(
      'SELECT id, estado FROM cajas WHERE id = ?',
      [id]
    );

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    // Solo permitir eliminar cajas disponibles
    if (cajaRows[0].estado !== 'disponible') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden eliminar cajas en estado disponible'
      });
    }

    // Eliminar caja
    await pool.execute(
      'DELETE FROM cajas WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Caja eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar caja:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener historial de cambios de estado de una caja
router.get('/:id/historial', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Por ahora retornamos un historial básico basado en las fechas
    const [cajaRows] = await pool.execute(`
      SELECT 
        c.*,
        f.codigo_unico as familia_codigo,
        b.nombre as benefactor_nombre
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      WHERE c.id = ?
    `, [id]);

    if (cajaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Caja no encontrada'
      });
    }

    const caja = cajaRows[0];
    const historial = [];

    // Crear historial basado en fechas
    historial.push({
      fecha: caja.created_at,
      estado: 'disponible',
      descripcion: 'Caja creada',
      usuario: 'Sistema'
    });

    if (caja.fecha_asignacion) {
      historial.push({
        fecha: caja.fecha_asignacion,
        estado: 'asignada',
        descripcion: `Asignada a benefactor: ${caja.benefactor_nombre}`,
        usuario: 'Usuario'
      });
    }

    if (caja.fecha_entrega) {
      historial.push({
        fecha: caja.fecha_entrega,
        estado: 'entregada',
        descripcion: 'Entregada a benefactor',
        usuario: 'Usuario'
      });
    }

    if (caja.fecha_devolucion) {
      historial.push({
        fecha: caja.fecha_devolucion,
        estado: 'devuelta',
        descripcion: 'Devuelta por benefactor',
        usuario: 'Usuario'
      });
    }

    res.json({
      success: true,
      data: {
        caja: caja,
        historial: historial
      }
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;

