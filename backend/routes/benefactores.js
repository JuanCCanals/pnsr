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

// ==================== RUTAS DE BENEFACTORES ====================

// Obtener todos los benefactores
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { activo, search, page = 1, limit = 50 } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (activo !== undefined) {
      whereConditions.push('b.activo = ?');
      queryParams.push(activo === 'true' ? 1 : 0);
    }
    
    if (search) {
      whereConditions.push(`(
        b.nombre LIKE ? OR 
        b.dni LIKE ? OR 
        b.telefono LIKE ? OR
        b.email LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Consulta principal con paginación
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(`
      SELECT 
        b.id,
        b.nombre,
        b.dni,
        b.telefono,
        b.email,
        b.direccion,
        b.activo,
        b.observaciones,
        b.created_at,
        b.updated_at,
        COUNT(c.id) as total_cajas_asignadas,
        COUNT(CASE WHEN c.estado = 'asignada' THEN 1 END) as cajas_asignadas,
        COUNT(CASE WHEN c.estado = 'entregada' THEN 1 END) as cajas_entregadas,
        COUNT(CASE WHEN c.estado = 'devuelta' THEN 1 END) as cajas_devueltas
      FROM benefactores b
      LEFT JOIN cajas c ON b.id = c.benefactor_id
      ${whereClause}
      GROUP BY b.id, b.nombre, b.dni, b.telefono, b.email, b.direccion, 
               b.activo, b.observaciones, b.created_at, b.updated_at
      ORDER BY b.nombre
      LIMIT ? OFFSET ?
    `, [...queryParams, parseInt(limit), parseInt(offset)]);

    // Contar total de registros
    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM benefactores b
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
    console.error('Error al obtener benefactores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de benefactores
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM benefactores');
    const [activosRows] = await pool.execute('SELECT COUNT(*) as activos FROM benefactores WHERE activo = 1');
    
    const [cajasRows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_cajas_asignadas,
        COUNT(CASE WHEN c.estado = 'asignada' THEN 1 END) as cajas_asignadas,
        COUNT(CASE WHEN c.estado = 'entregada' THEN 1 END) as cajas_entregadas,
        COUNT(CASE WHEN c.estado = 'devuelta' THEN 1 END) as cajas_devueltas
      FROM cajas c
      INNER JOIN benefactores b ON c.benefactor_id = b.id
      WHERE b.activo = 1
    `);

    const [topBenefactoresRows] = await pool.execute(`
      SELECT 
        b.nombre,
        COUNT(c.id) as total_cajas
      FROM benefactores b
      INNER JOIN cajas c ON b.id = c.benefactor_id
      WHERE b.activo = 1
      GROUP BY b.id, b.nombre
      ORDER BY total_cajas DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        activos: activosRows[0].activos,
        cajas_stats: cajasRows[0],
        top_benefactores: topBenefactoresRows,
        porcentaje_activos: totalRows[0].total > 0 ? 
          (activosRows[0].activos / totalRows[0].total * 100).toFixed(1) : 0
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

// Obtener un benefactor por ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT * FROM benefactores WHERE id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benefactor no encontrado'
      });
    }

    // Obtener cajas asignadas
    const [cajasRows] = await pool.execute(`
      SELECT 
        c.*,
        f.codigo_unico as familia_codigo,
        f.nombre_padre,
        f.nombre_madre,
        z.nombre as zona_nombre
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      WHERE c.benefactor_id = ?
      ORDER BY c.created_at DESC
    `, [id]);

    const benefactor = rows[0];
    benefactor.cajas = cajasRows;

    res.json({
      success: true,
      data: benefactor
    });
  } catch (error) {
    console.error('Error al obtener benefactor:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nuevo benefactor
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { nombre, dni, telefono, email, direccion, observaciones } = req.body;

    // Validaciones básicas
    const errors = [];
    
    if (!nombre || nombre.trim().length < 2) {
      errors.push({ field: 'nombre', message: 'El nombre debe tener al menos 2 caracteres' });
    }
    
    if (!dni || dni.trim().length !== 8) {
      errors.push({ field: 'dni', message: 'El DNI debe tener 8 dígitos' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si el DNI ya existe
    const [existingDni] = await pool.execute(
      'SELECT id FROM benefactores WHERE dni = ?',
      [dni.trim()]
    );

    if (existingDni.length > 0) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'dni', message: 'Ya existe un benefactor con este DNI' }],
        message: 'DNI duplicado'
      });
    }

    // Insertar benefactor
    const [result] = await pool.execute(
      'INSERT INTO benefactores (nombre, dni, telefono, email, direccion, observaciones) VALUES (?, ?, ?, ?, ?, ?)',
      [
        nombre.trim(),
        dni.trim(),
        telefono?.trim() || null,
        email?.trim() || null,
        direccion?.trim() || null,
        observaciones?.trim() || null
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        nombre: nombre.trim(),
        dni: dni.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
        observaciones: observaciones?.trim() || null,
        activo: true
      },
      message: 'Benefactor creado exitosamente'
    });

  } catch (error) {
    console.error('Error al crear benefactor:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar benefactor
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, dni, telefono, email, direccion, observaciones, activo } = req.body;

    // Verificar si el benefactor existe
    const [existingBenefactor] = await pool.execute(
      'SELECT id FROM benefactores WHERE id = ?',
      [id]
    );

    if (existingBenefactor.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benefactor no encontrado'
      });
    }

    // Verificar DNI duplicado si se está actualizando
    if (dni) {
      const [existingDni] = await pool.execute(
        'SELECT id FROM benefactores WHERE dni = ? AND id != ?',
        [dni.trim(), id]
      );

      if (existingDni.length > 0) {
        return res.status(400).json({
          success: false,
          errors: [{ field: 'dni', message: 'Ya existe otro benefactor con este DNI' }],
          message: 'DNI duplicado'
        });
      }
    }

    // Preparar campos para actualizar
    let updateFields = [];
    let updateValues = [];

    if (nombre) {
      updateFields.push('nombre = ?');
      updateValues.push(nombre.trim());
    }
    if (dni) {
      updateFields.push('dni = ?');
      updateValues.push(dni.trim());
    }
    if (telefono !== undefined) {
      updateFields.push('telefono = ?');
      updateValues.push(telefono?.trim() || null);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email?.trim() || null);
    }
    if (direccion !== undefined) {
      updateFields.push('direccion = ?');
      updateValues.push(direccion?.trim() || null);
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
        `UPDATE benefactores SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    res.json({
      success: true,
      message: 'Benefactor actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar benefactor:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Cambiar estado de benefactor (activar/desactivar)
router.patch('/:id/toggle-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    const [benefactorRows] = await pool.execute(
      'SELECT activo FROM benefactores WHERE id = ?',
      [id]
    );

    if (benefactorRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benefactor no encontrado'
      });
    }

    const nuevoEstado = !benefactorRows[0].activo;

    // Si se está desactivando, verificar que no tenga cajas asignadas
    if (!nuevoEstado) {
      const [cajasAsignadas] = await pool.execute(
        'SELECT COUNT(*) as total FROM cajas WHERE benefactor_id = ? AND estado IN ("asignada", "entregada")',
        [id]
      );

      if (cajasAsignadas[0].total > 0) {
        return res.status(400).json({
          success: false,
          error: 'No se puede desactivar el benefactor porque tiene cajas asignadas o entregadas'
        });
      }
    }

    // Actualizar estado
    await pool.execute(
      'UPDATE benefactores SET activo = ? WHERE id = ?',
      [nuevoEstado, id]
    );

    res.json({
      success: true,
      message: `Benefactor ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente`
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar benefactor
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el benefactor existe
    const [existingBenefactor] = await pool.execute(
      'SELECT id FROM benefactores WHERE id = ?',
      [id]
    );

    if (existingBenefactor.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benefactor no encontrado'
      });
    }

    // Verificar si tiene cajas asociadas
    const [cajasAsociadas] = await pool.execute(
      'SELECT COUNT(*) as total FROM cajas WHERE benefactor_id = ?',
      [id]
    );

    if (cajasAsociadas[0].total > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar el benefactor porque tiene cajas asociadas'
      });
    }

    // Eliminar benefactor
    await pool.execute(
      'DELETE FROM benefactores WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Benefactor eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar benefactor:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener cajas asignadas a un benefactor
router.get('/:id/cajas', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        c.*,
        f.codigo_unico as familia_codigo,
        f.nombre_padre,
        f.nombre_madre,
        f.direccion as familia_direccion,
        z.nombre as zona_nombre,
        z.abreviatura as zona_abreviatura
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      WHERE c.benefactor_id = ?
      ORDER BY c.created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener cajas del benefactor:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;

