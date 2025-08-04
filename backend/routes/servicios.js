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

// Función para generar número de comprobante
const generarNumeroComprobante = async () => {
  const anioActual = new Date().getFullYear();
  const [maxNumeroRows] = await pool.execute(`
    SELECT MAX(CAST(SUBSTRING(numero_comprobante, -6) AS UNSIGNED)) as max_numero
    FROM servicios 
    WHERE numero_comprobante LIKE ?
  `, [`${anioActual}-%`]);

  const siguienteNumero = (maxNumeroRows[0].max_numero || 0) + 1;
  return `${anioActual}-${siguienteNumero.toString().padStart(6, '0')}`;
};

// ==================== RUTAS DE SERVICIOS ====================

// Obtener todos los servicios con filtros
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      tipo_servicio, 
      estado_pago, 
      fecha_desde, 
      fecha_hasta,
      search, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (tipo_servicio) {
      whereConditions.push('s.tipo_servicio = ?');
      queryParams.push(tipo_servicio);
    }
    
    if (estado_pago) {
      whereConditions.push('s.estado_pago = ?');
      queryParams.push(estado_pago);
    }
    
    if (fecha_desde) {
      whereConditions.push('DATE(s.fecha_servicio) >= ?');
      queryParams.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      whereConditions.push('DATE(s.fecha_servicio) <= ?');
      queryParams.push(fecha_hasta);
    }
    
    if (search) {
      whereConditions.push(`(
        s.numero_comprobante LIKE ? OR 
        s.nombre_solicitante LIKE ? OR 
        s.telefono_solicitante LIKE ? OR
        s.descripcion LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Consulta principal con paginación
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(`
      SELECT 
        s.id,
        s.numero_comprobante,
        s.tipo_servicio,
        s.fecha_servicio,
        s.hora_servicio,
        s.nombre_solicitante,
        s.telefono_solicitante,
        s.email_solicitante,
        s.descripcion,
        s.monto_soles,
        s.monto_dolares,
        s.estado_pago,
        s.forma_pago,
        s.observaciones,
        s.created_at,
        s.updated_at
      FROM servicios s
      ${whereClause}
      ORDER BY s.fecha_servicio DESC, s.hora_servicio DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, parseInt(limit), parseInt(offset)]);

    // Contar total de registros
    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM servicios s
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
    console.error('Error al obtener servicios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de servicios
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM servicios');
    
    const [tiposRows] = await pool.execute(`
      SELECT 
        tipo_servicio,
        COUNT(*) as cantidad,
        SUM(monto_soles) as total_soles,
        SUM(monto_dolares) as total_dolares
      FROM servicios 
      GROUP BY tipo_servicio
    `);

    const [estadoPagoRows] = await pool.execute(`
      SELECT 
        estado_pago,
        COUNT(*) as cantidad,
        SUM(monto_soles) as total_soles,
        SUM(monto_dolares) as total_dolares
      FROM servicios 
      GROUP BY estado_pago
    `);

    const [formaPagoRows] = await pool.execute(`
      SELECT 
        forma_pago,
        COUNT(*) as cantidad,
        SUM(monto_soles) as total_soles,
        SUM(monto_dolares) as total_dolares
      FROM servicios 
      WHERE forma_pago IS NOT NULL
      GROUP BY forma_pago
    `);

    const [mesActualRows] = await pool.execute(`
      SELECT 
        COUNT(*) as servicios_mes,
        SUM(monto_soles) as ingresos_soles_mes,
        SUM(monto_dolares) as ingresos_dolares_mes
      FROM servicios 
      WHERE YEAR(fecha_servicio) = YEAR(CURDATE()) 
      AND MONTH(fecha_servicio) = MONTH(CURDATE())
    `);

    const [anioActualRows] = await pool.execute(`
      SELECT 
        COUNT(*) as servicios_anio,
        SUM(monto_soles) as ingresos_soles_anio,
        SUM(monto_dolares) as ingresos_dolares_anio
      FROM servicios 
      WHERE YEAR(fecha_servicio) = YEAR(CURDATE())
    `);

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        por_tipo: tiposRows,
        por_estado_pago: estadoPagoRows,
        por_forma_pago: formaPagoRows,
        mes_actual: mesActualRows[0],
        anio_actual: anioActualRows[0]
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

// Obtener un servicio por ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT * FROM servicios WHERE id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Servicio no encontrado'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error al obtener servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nuevo servicio
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      tipo_servicio,
      fecha_servicio,
      hora_servicio,
      nombre_solicitante,
      telefono_solicitante,
      email_solicitante,
      descripcion,
      monto_soles,
      monto_dolares,
      estado_pago = 'pendiente',
      forma_pago,
      observaciones
    } = req.body;

    // Validaciones básicas
    const errors = [];
    
    if (!tipo_servicio) {
      errors.push({ field: 'tipo_servicio', message: 'El tipo de servicio es requerido' });
    }
    
    if (!fecha_servicio) {
      errors.push({ field: 'fecha_servicio', message: 'La fecha del servicio es requerida' });
    }
    
    if (!nombre_solicitante || nombre_solicitante.trim().length < 2) {
      errors.push({ field: 'nombre_solicitante', message: 'El nombre del solicitante debe tener al menos 2 caracteres' });
    }
    
    if (!monto_soles && !monto_dolares) {
      errors.push({ field: 'monto', message: 'Debe especificar al menos un monto (soles o dólares)' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Generar número de comprobante
    const numeroComprobante = await generarNumeroComprobante();

    // Insertar servicio
    const [result] = await pool.execute(
      `INSERT INTO servicios (
        numero_comprobante, tipo_servicio, fecha_servicio, hora_servicio,
        nombre_solicitante, telefono_solicitante, email_solicitante,
        descripcion, monto_soles, monto_dolares, estado_pago, forma_pago, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numeroComprobante,
        tipo_servicio,
        fecha_servicio,
        hora_servicio || null,
        nombre_solicitante.trim(),
        telefono_solicitante?.trim() || null,
        email_solicitante?.trim() || null,
        descripcion?.trim() || null,
        monto_soles || null,
        monto_dolares || null,
        estado_pago,
        forma_pago || null,
        observaciones?.trim() || null
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        numero_comprobante: numeroComprobante,
        tipo_servicio,
        fecha_servicio,
        hora_servicio: hora_servicio || null,
        nombre_solicitante: nombre_solicitante.trim(),
        monto_soles: monto_soles || null,
        monto_dolares: monto_dolares || null,
        estado_pago
      },
      message: 'Servicio creado exitosamente'
    });

  } catch (error) {
    console.error('Error al crear servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar servicio
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      tipo_servicio,
      fecha_servicio,
      hora_servicio,
      nombre_solicitante,
      telefono_solicitante,
      email_solicitante,
      descripcion,
      monto_soles,
      monto_dolares,
      estado_pago,
      forma_pago,
      observaciones
    } = req.body;

    // Verificar si el servicio existe
    const [existingServicio] = await pool.execute(
      'SELECT id FROM servicios WHERE id = ?',
      [id]
    );

    if (existingServicio.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Servicio no encontrado'
      });
    }

    // Preparar campos para actualizar
    let updateFields = [];
    let updateValues = [];

    if (tipo_servicio) {
      updateFields.push('tipo_servicio = ?');
      updateValues.push(tipo_servicio);
    }
    if (fecha_servicio) {
      updateFields.push('fecha_servicio = ?');
      updateValues.push(fecha_servicio);
    }
    if (hora_servicio !== undefined) {
      updateFields.push('hora_servicio = ?');
      updateValues.push(hora_servicio || null);
    }
    if (nombre_solicitante) {
      updateFields.push('nombre_solicitante = ?');
      updateValues.push(nombre_solicitante.trim());
    }
    if (telefono_solicitante !== undefined) {
      updateFields.push('telefono_solicitante = ?');
      updateValues.push(telefono_solicitante?.trim() || null);
    }
    if (email_solicitante !== undefined) {
      updateFields.push('email_solicitante = ?');
      updateValues.push(email_solicitante?.trim() || null);
    }
    if (descripcion !== undefined) {
      updateFields.push('descripcion = ?');
      updateValues.push(descripcion?.trim() || null);
    }
    if (monto_soles !== undefined) {
      updateFields.push('monto_soles = ?');
      updateValues.push(monto_soles || null);
    }
    if (monto_dolares !== undefined) {
      updateFields.push('monto_dolares = ?');
      updateValues.push(monto_dolares || null);
    }
    if (estado_pago) {
      updateFields.push('estado_pago = ?');
      updateValues.push(estado_pago);
    }
    if (forma_pago !== undefined) {
      updateFields.push('forma_pago = ?');
      updateValues.push(forma_pago || null);
    }
    if (observaciones !== undefined) {
      updateFields.push('observaciones = ?');
      updateValues.push(observaciones?.trim() || null);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE servicios SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    res.json({
      success: true,
      message: 'Servicio actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Marcar servicio como pagado
router.post('/:id/marcar-pagado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { forma_pago, observaciones } = req.body;

    if (!forma_pago) {
      return res.status(400).json({
        success: false,
        error: 'La forma de pago es requerida'
      });
    }

    // Verificar que el servicio existe
    const [servicioRows] = await pool.execute(
      'SELECT id, estado_pago FROM servicios WHERE id = ?',
      [id]
    );

    if (servicioRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Servicio no encontrado'
      });
    }

    // Actualizar estado de pago
    await pool.execute(
      'UPDATE servicios SET estado_pago = ?, forma_pago = ?, observaciones = ? WHERE id = ?',
      ['pagado', forma_pago, observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Servicio marcado como pagado exitosamente'
    });

  } catch (error) {
    console.error('Error al marcar como pagado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Cancelar servicio
router.post('/:id/cancelar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    // Verificar que el servicio existe
    const [servicioRows] = await pool.execute(
      'SELECT id, estado_pago FROM servicios WHERE id = ?',
      [id]
    );

    if (servicioRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Servicio no encontrado'
      });
    }

    if (servicioRows[0].estado_pago === 'pagado') {
      return res.status(400).json({
        success: false,
        error: 'No se puede cancelar un servicio que ya fue pagado'
      });
    }

    // Cancelar servicio
    await pool.execute(
      'UPDATE servicios SET estado_pago = ?, observaciones = ? WHERE id = ?',
      ['cancelado', observaciones?.trim() || null, id]
    );

    res.json({
      success: true,
      message: 'Servicio cancelado exitosamente'
    });

  } catch (error) {
    console.error('Error al cancelar servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar servicio
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el servicio existe
    const [servicioRows] = await pool.execute(
      'SELECT id, estado_pago FROM servicios WHERE id = ?',
      [id]
    );

    if (servicioRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Servicio no encontrado'
      });
    }

    if (servicioRows[0].estado_pago === 'pagado') {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar un servicio que ya fue pagado'
      });
    }

    // Eliminar servicio
    await pool.execute(
      'DELETE FROM servicios WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Servicio eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener tipos de servicio disponibles
router.get('/config/tipos', authenticateToken, async (req, res) => {
  try {
    // Tipos de servicio según el documento funcional
    const tiposServicio = [
      { value: 'misa', label: 'Misa' },
      { value: 'bautizo', label: 'Bautizo' },
      { value: 'matrimonio', label: 'Matrimonio' },
      { value: 'confirmacion', label: 'Confirmación' },
      { value: 'primera_comunion', label: 'Primera Comunión' },
      { value: 'funeral', label: 'Funeral' },
      { value: 'bendicion', label: 'Bendición' },
      { value: 'quinceañero', label: 'Quinceañero' },
      { value: 'otros', label: 'Otros' }
    ];

    res.json({
      success: true,
      data: tiposServicio
    });
  } catch (error) {
    console.error('Error al obtener tipos de servicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener formas de pago disponibles
router.get('/config/formas-pago', authenticateToken, async (req, res) => {
  try {
    const formasPago = [
      { value: 'efectivo', label: 'Efectivo' },
      { value: 'transferencia', label: 'Transferencia Bancaria' },
      { value: 'deposito', label: 'Depósito Bancario' },
      { value: 'yape', label: 'Yape' },
      { value: 'plin', label: 'Plin' },
      { value: 'tarjeta', label: 'Tarjeta de Crédito/Débito' }
    ];

    res.json({
      success: true,
      data: formasPago
    });
  } catch (error) {
    console.error('Error al obtener formas de pago:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;

