const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authenticateToken = require('../middlewares/auth');
const pool = require('../config/db');  
require('dotenv').config();
// Cargar .env desde la carpeta backend (no desde src)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const benefactoresRoutes = require('../routes/benefactores');
const ventasRoutes = require('../routes/ventas');
const catalogosRoutes = require('../routes/catalogos');

const DEMO = process.env.DEMO_MODE === 'true';
if (DEMO) console.warn('⚠️ DEMO_MODE ENABLED: auth bypassed for demo purposes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// === NO validar token en rutas públicas ===
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register'
];

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Test rápido de que Express responde
app.get('/api/ping', (_req, res) => {
  res.send('pong');
});

app.use((req, res, next) => {
  const url = req.originalUrl || req.url || req.path || '';
  if (PUBLIC_PATHS.some(p => url.startsWith(p))) {
    return next(); // Saltar validación en /api/auth/*
  }
  return authenticateToken(req, res, next); // Aplicar en el resto
});

app.use('/api/benefactores', benefactoresRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/catalogos', catalogosRoutes);
// ==========================================







// ==================== RUTAS DE AUTENTICACIÓN ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (DEMO) {
      const user = {
        id: 1,
        nombre: 'Demo User',
        email,                // el que ponga tu clienta
        rol: 'admin',
        permisos: []          // o pon los que quieras mostrar
      };
      const token = jwt.sign(
        { id: user.id, email: user.email, rol: user.rol },
        process.env.JWT_SECRET || 'demo-secret',
        { expiresIn: '24h' }
      );
      return res.json({ success: true, token, user });
    }
    

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario
    const [rows] = await pool.execute(
      'SELECT id, nombre, email, password_hash AS password, rol, activo FROM usuarios WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    const usuario = rows[0];

    if (!usuario.activo) {
      return res.status(401).json({
        success: false,
        error: 'Usuario inactivo'
      });
    }

    // Verificar contraseña
    const passwordValid = await bcryptjs.compare(password, usuario.password);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

  // Obtener permisos del usuario (activos)
  const [permisosRows] = await pool.execute(
    `SELECT p.modulo, p.nombre
      FROM usuario_permisos up 
      JOIN permisos p ON up.permiso_id = p.id
      WHERE up.usuario_id = ? AND (up.activo IS NULL OR up.activo = 1) AND (p.activo IS NULL OR p.activo = 1)
      ORDER BY p.modulo`,
    [usuario.id]
  );
  const permisos = permisosRows.map(r => ({ modulo: r.modulo, nombre: r.nombre }));

    // Generar token (consistente con req.user.id)
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Verificar token
app.get('/api/auth/verify', async (req, res) => {
  try {
    // Obtener permisos del usuario
    const [permisosRows] = await pool.execute(
      `SELECT p.modulo, p.nombre
          FROM usuario_permisos up 
          JOIN permisos p ON up.permiso_id = p.id 
        WHERE up.usuario_id = ? AND (up.activo IS NULL OR up.activo = 1) AND (p.activo IS NULL OR p.activo = 1)
        ORDER BY p.modulo`,
      [req.user.id]
    );
    const permisos = permisosRows.map(r => ({ modulo: r.modulo, nombre: r.nombre }));
    

    res.json({
      success: true,
      user: {
        id: req.user.id,
        nombre: req.user.nombre,
        email: req.user.email,
        rol: req.user.rol,
        permisos
      }
    });
  } catch (error) {
    console.error('Error en verify:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ==================== RUTAS DE USUARIOS ====================

// Obtener todos los usuarios
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        u.id, 
        u.nombre, 
        u.email, 
        u.rol, 
        u.activo, 
        u.created_at,
        u.ultimo_acceso,
        COUNT(up.permiso_id) as total_permisos
      FROM usuarios u
      LEFT JOIN usuario_permisos up ON u.id = up.usuario_id
      GROUP BY u.id, u.nombre, u.email, u.rol, u.activo, u.created_at, u.ultimo_acceso
      ORDER BY u.nombre
    `);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de usuarios
app.get('/api/usuarios/stats', authenticateToken, async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios');
    const [activosRows] = await pool.execute('SELECT COUNT(*) as activos FROM usuarios WHERE activo = 1');
    const [adminsRows] = await pool.execute('SELECT COUNT(*) as admins FROM usuarios WHERE rol = "admin"');
    const [activosMesRows] = await pool.execute(`
      SELECT COUNT(*) as activos_mes 
      FROM usuarios 
      WHERE ultimo_acceso >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND activo = 1
    `);

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        activos: activosRows[0].activos,
        admins: adminsRows[0].admins,
        activos_mes: activosMesRows[0].activos_mes
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

// Obtener un usuario por ID
app.get('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const usuario = rows[0];

    // Obtener permisos del usuario
    const [permisosRows] = await pool.execute(
      `SELECT p.id, p.nombre 
       FROM usuario_permisos up 
       JOIN permisos p ON up.permiso_id = p.id 
       WHERE up.usuario_id = ?`,
      [id]
    );

    usuario.permisos = permisosRows;

    res.json({
      success: true,
      data: usuario
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener permisos de un usuario específico
app.get('/api/usuarios/:id/permisos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener todos los permisos disponibles
    const [todosPermisos] = await pool.execute('SELECT id, nombre, descripcion FROM permisos ORDER BY nombre');
    
    // Obtener permisos asignados al usuario
    const [permisosAsignados] = await pool.execute(
      'SELECT permiso_id FROM usuario_permisos WHERE usuario_id = ?',
      [id]
    );

    const permisosAsignadosIds = permisosAsignados.map(p => p.permiso_id);

    // Combinar información
    const permisos = todosPermisos.map(permiso => ({
      ...permiso,
      asignado: permisosAsignadosIds.includes(permiso.id)
    }));

    res.json({
      success: true,
      data: permisos
    });
  } catch (error) {
    console.error('Error al obtener permisos del usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nuevo usuario
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { nombre, email, password, rol, activo, permisos } = req.body;

    // Validaciones básicas
    const errors = [];
    if (!nombre || nombre.trim().length < 2) {
      errors.push({ field: 'nombre', message: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'email', message: 'Ingrese un email válido' });
    }
    if (!password || password.length < 6) {
      errors.push({ field: 'password', message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si el email ya existe
    const [existingUser] = await pool.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'email', message: 'El email ya está en uso' }],
        message: 'El email ya está registrado'
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Insertar usuario
    const [result] = await pool.execute(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?)',
      [nombre.trim(), email.toLowerCase(), hashedPassword, rol || 'operador', activo !== false]
    );

    const usuarioId = result.insertId;

    // Asignar permisos si se proporcionaron
    if (permisos && Array.isArray(permisos)) {
      for (let permisoId of permisos) {
        await pool.execute(
          'INSERT INTO usuario_permisos (usuario_id, permiso_id) VALUES (?, ?)',
          [usuarioId, permisoId]
        );
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: usuarioId,
        nombre: nombre.trim(),
        email: email.toLowerCase(),
        rol: rol || 'operador',
        activo: activo !== false
      },
      message: 'Usuario creado exitosamente'
    });

  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar usuario
app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, rol, activo, permisos } = req.body;

    // Verificar si el usuario existe
    const [existingUser] = await pool.execute(
      'SELECT id FROM usuarios WHERE id = ?',
      [id]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Validaciones básicas
    const errors = [];
    if (nombre && nombre.trim().length < 2) {
      errors.push({ field: 'nombre', message: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'email', message: 'Ingrese un email válido' });
    }
    if (password && password.length < 6) {
      errors.push({ field: 'password', message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si el email ya está en uso por otro usuario
    if (email) {
      const [emailCheck] = await pool.execute(
        'SELECT id FROM usuarios WHERE email = ? AND id != ?',
        [email, id]
      );

      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          errors: [{ field: 'email', message: 'El email ya está en uso' }],
          message: 'El email ya está registrado'
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
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email.toLowerCase());
    }
    if (password) {
      const hashedPassword = await bcryptjs.hash(password, 10);
      updateFields.push('password_hash = ?');
      updateValues.push(hashedPassword);
    }
    if (rol) {
      updateFields.push('rol = ?');
      updateValues.push(rol);
    }
    if (activo !== undefined) {
      updateFields.push('activo = ?');
      updateValues.push(activo);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE usuarios SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Actualizar permisos si se proporcionaron
    if (permisos && Array.isArray(permisos)) {
      // Eliminar permisos existentes
      await pool.execute(
        'DELETE FROM usuario_permisos WHERE usuario_id = ?',
        [id]
      );

      // Insertar nuevos permisos
      for (let permisoId of permisos) {
        await pool.execute(
          'INSERT INTO usuario_permisos (usuario_id, permiso_id) VALUES (?, ?)',
          [id, permisoId]
        );
      }
    }

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Cambiar estado de usuario (activar/desactivar)
app.patch('/api/usuarios/:id/toggle-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    const [userRows] = await pool.execute(
      'SELECT activo FROM usuarios WHERE id = ?',
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const nuevoEstado = !userRows[0].activo;

    // Actualizar estado
    await pool.execute(
      'UPDATE usuarios SET activo = ? WHERE id = ?',
      [nuevoEstado, id]
    );

    res.json({
      success: true,
      message: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente`
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar usuario
app.delete('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el usuario existe
    const [existingUser] = await pool.execute(
      'SELECT id FROM usuarios WHERE id = ?',
      [id]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Eliminar permisos del usuario
    await pool.execute(
      'DELETE FROM usuario_permisos WHERE usuario_id = ?',
      [id]
    );

    // Eliminar usuario
    await pool.execute(
      'DELETE FROM usuarios WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ==================== RUTAS DE PERMISOS ====================

// Obtener todos los permisos disponibles
app.get('/api/permisos', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nombre, descripcion FROM permisos ORDER BY nombre'
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener permisos para el endpoint que espera el frontend
app.get('/api/usuarios/permisos', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nombre, descripcion FROM permisos ORDER BY nombre'
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ==================== RUTAS MODULARES ====================

// Importar rutas modulares
const zonasRoutes           = require('../routes/zonas');
const familiasRoutes        = require('../routes/familias');
const familiasImportRoute   = require('../routes/FamiliasImportRoute');
const cajasRoutes           = require('../routes/cajas');
const campaniasRoute        = require('../routes/CampaniasRoute');
const modalidadesRoute      = require('../routes/ModalidadesRoute');
const puntosVentaRoute      = require('../routes/PuntosVentaRoute');
const reportesRoutes        = require('../routes/reportes');
const dashboardRoute        = require('../routes/DashboardRoute');
const tiposServicioRoute    = require('../routes/tipos-servicio');

// Rutas nuevas/actualizadas que agregamos en esta iteración
const serviciosRoute        = require('../routes/servicios'); // <-- usa el archivo en minúsculas que te pasé
const clientesRoute         = require('../routes/clientes');  // <-- nuevo
const cobrosRoute           = require('../routes/cobros');    // <-- nuevo
const ventasRoute           = require('../routes/ventas');    // <-- usa el archivo en minúsculas

// Usar rutas (orden recomendado)
app.use('/api/zonas',              zonasRoutes);
app.use('/api/familias/import-excel', familiasImportRoute);
app.use('/api/familias',           familiasRoutes);
app.use('/api/cajas',              cajasRoutes);
app.use('/api/campanias',          campaniasRoute);
app.use('/api/modalidades',        modalidadesRoute);
app.use('/api/puntos-venta',       puntosVentaRoute);
app.use('/api/tipos-servicio', tiposServicioRoute);

// Nuevos/actualizados
app.use('/api/clientes',           clientesRoute);
app.use('/api/servicios',          serviciosRoute);
app.use('/api/cobros',             cobrosRoute);
app.use('/api/ventas',             ventasRoute);

app.use('/api/reportes', reportesRoutes);
app.use('/api/dashboard', require('../routes/DashboardRoute'));

// ==================== SERVIDOR ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`?? Servidor ejecutándose en puerto ${PORT}`);
  console.log(`?? CORS habilitado para: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});