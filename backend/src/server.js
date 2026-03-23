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

// const benefactoresRoutes = require('../routes/benefactores');
const ventasRoutes = require("../routes/ventas");
const catalogosRoutes = require("../routes/catalogos");
const permisosRoutes = require("../routes/permisos");
const dashboardRoutes = require("../routes/dashboard");
const reportesRoutes = require("../routes/reportes");
const integracionRoutes = require("../routes/integracion");
const excedentesRoute   = require('../routes/excedentes');
const comprobantesRoute = require("../routes/comprobantes");
const donacionesFisicasRoutes = require('../routes/donacionesFisicas');
const rolesRoutes = require('../routes/roles');
const modulosRoutes = require('../routes/modulos');

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


// ==========================================
// ✅ NUEVA FUNCIÓN: Obtener usuario con permisos del sistema RBAC
// ==========================================

/**
 * Obtener información completa del usuario incluyendo rol y permisos
 * @param {number} userId 
 * @returns {Promise<object>} Información del usuario con permisos
 */
async function getUserWithPermissions(userId) {
  try {
    // Obtener datos básicos del usuario y su rol
    const [usuarios] = await pool.execute(`
      SELECT 
        u.id,
        u.nombre,
        u.email,
        u.activo,
        r.id as rol_id,
        r.nombre as rol_nombre,
        r.slug as rol_slug,
        r.es_admin
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      WHERE u.id = ? AND u.activo = TRUE AND r.activo = TRUE
    `, [userId]);

    if (usuarios.length === 0) {
      return null;
    }

    const usuario = usuarios[0];

    // Si es admin, no necesita permisos individuales
    if (usuario.es_admin) {
      return {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: {
          id: usuario.rol_id,
          nombre: usuario.rol_nombre,
          slug: usuario.rol_slug,
          es_admin: true
        },
        permisos: ['*'], // Acceso total
        modulos: [] // Admin tiene acceso a todos
      };
    }

    // Obtener permisos del usuario
    const [permisos] = await pool.execute(`
      SELECT DISTINCT
        p.slug,
        p.accion,
        m.slug as modulo_slug,
        m.nombre as modulo_nombre,
        m.ruta as modulo_ruta
      FROM rol_permisos rp
      JOIN permisos p ON rp.permiso_id = p.id
      JOIN modulos m ON p.modulo_id = m.id
      WHERE rp.rol_id = ? AND p.activo = TRUE AND m.activo = TRUE
      ORDER BY m.orden, p.accion
    `, [usuario.rol_id]);

    // Crear array de slugs de permisos
    const permisosArray = permisos.map(p => p.slug);

    // Crear array de módulos únicos con sus permisos
    const modulosMap = {};
    permisos.forEach(p => {
      if (!modulosMap[p.modulo_slug]) {
        modulosMap[p.modulo_slug] = {
          slug: p.modulo_slug,
          nombre: p.modulo_nombre,
          ruta: p.modulo_ruta,
          permisos: []
        };
      }
      modulosMap[p.modulo_slug].permisos.push(p.accion);
    });

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: {
        id: usuario.rol_id,
        nombre: usuario.rol_nombre,
        slug: usuario.rol_slug,
        es_admin: false
      },
      permisos: permisosArray,
      modulos: Object.values(modulosMap)
    };
  } catch (error) {
    console.error('Error obteniendo usuario con permisos:', error);
    return null;
  }
}

// ==========================================
// NOTA: Esta función assignPermissionsByRole ya no se usa con el nuevo sistema
// pero la dejamos comentada por si necesitas migrar usuarios antiguos
// ==========================================

/*
async function assignPermissionsByRole(usuarioId, rol) {
  if (!usuarioId || !rol) return;

  // Limpia permisos actuales
  await pool.execute(
    'DELETE FROM usuario_permisos WHERE usuario_id = ?',
    [usuarioId]
  );

  // Admin: todos los permisos activos
  if (rol === 'admin') {
    const [allPerms] = await pool.execute(
      'SELECT id FROM permisos WHERE activo = 1'
    );
    if (!allPerms.length) return;

    const values = allPerms.map(p => [usuarioId, p.id]);
    await pool.query(
      'INSERT INTO usuario_permisos (usuario_id, permiso_id) VALUES ?',
      [values]
    );
    return;
  }

  // Otros roles: según módulos definidos
  const modules = ROLE_MODULES[rol] || [];
  if (!modules.length) return;

  const placeholders = modules.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id FROM permisos WHERE activo = 1 AND modulo IN (${placeholders})`,
    modules
  );

  if (!rows.length) return;

  const values = rows.map(p => [usuarioId, p.id]);
  await pool.query(
    'INSERT INTO usuario_permisos (usuario_id, permiso_id) VALUES ?',
    [values]
  );
}
*/


app.use((req, res, next) => {
  const url = req.originalUrl || req.url || req.path || '';
  if (PUBLIC_PATHS.some(p => url.startsWith(p))) {
    return next(); // Saltar validación en /api/auth/*
  }
  return authenticateToken(req, res, next); // Aplicar en el resto
});

app.use('/api/benefactores', ventasRoutes); // alias "amistoso" para el cliente
app.use('/api/ventas', ventasRoutes);       // alias técnico (opcional, útil si ya lo usabas)
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/permisos", permisosRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/integracion", integracionRoutes);

app.use('/api/permisos', permisosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reportes', reportesRoutes);

app.use('/api/excedentes', excedentesRoute);

app.use('/api/donaciones-fisicas', donacionesFisicasRoutes);

app.use("/api/comprobantes", comprobantesRoute); // 👈 NUEVO

app.use('/api/roles', rolesRoutes);
app.use('/api/modulos', modulosRoutes);
// ==========================================







// ==================== RUTAS DE AUTENTICACIÓN ====================
// ✅ Login ACTUALIZADO - Ahora usa getUserWithPermissions
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario
    const [rows] = await pool.execute(
      'SELECT id, nombre, email, password_hash AS password, rol, activo, rol_id FROM usuarios WHERE email = ? LIMIT 1',
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

    // ✅ NUEVO: Obtener datos completos con permisos del sistema RBAC
    const usuarioCompleto = await getUserWithPermissions(usuario.id);

    if (!usuarioCompleto) {
      return res.status(401).json({
        success: false,
        error: 'Error al cargar permisos del usuario'
      });
    }

    // ✅ NUEVO: Token incluye información del rol
    const token = jwt.sign(
      { 
        id: usuarioCompleto.id, 
        email: usuarioCompleto.email,
        rol_slug: usuarioCompleto.rol.slug,
        es_admin: usuarioCompleto.rol.es_admin
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // ✅ NUEVO: Respuesta incluye estructura completa de permisos
    res.json({
      success: true,
      token,
      user: usuarioCompleto
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// ✅ Verificar token ACTUALIZADO - Ahora usa getUserWithPermissions
app.get('/api/auth/verify', async (req, res) => {
  try {
    // En este punto, authenticateToken ya se ejecutó y puso req.user
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }

    // ✅ NUEVO: Obtener datos completos con permisos del sistema RBAC
    const usuarioCompleto = await getUserWithPermissions(req.user.id);

    if (!usuarioCompleto) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // ✅ NUEVO: Respuesta incluye estructura completa de permisos
    res.json({
      success: true,
      user: usuarioCompleto
    });

  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    // Validaciones básicas
    if (!nombre || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, email y contraseña son requeridos'
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de email inválido'
      });
    }

    // Verificar si el email ya existe
    const [existing] = await pool.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'El email ya está registrado'
      });
    }

    // Hash de la contraseña
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Si no se proporciona rol, asignar 'consulta' por defecto
    const userRol = rol || 'consulta';
    
    // Obtener rol_id del rol proporcionado o por defecto
    const [rolData] = await pool.execute(
      'SELECT id FROM roles WHERE slug = ? AND activo = TRUE LIMIT 1',
      [userRol]
    );

    if (rolData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Rol no válido'
      });
    }

    const rol_id = rolData[0].id;

    // Crear usuario
    const [result] = await pool.execute(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, rol_id, activo) VALUES (?, ?, ?, ?, ?, TRUE)',
      [nombre, email, hashedPassword, userRol, rol_id]
    );

    const userId = result.insertId;

    // Generar token
    const token = jwt.sign(
      { id: userId, email, rol: userRol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Obtener datos completos con permisos
    const usuarioCompleto = await getUserWithPermissions(userId);

    res.status(201).json({
      success: true,
      token,
      user: usuarioCompleto || {
        id: userId,
        nombre,
        email,
        rol: { slug: userRol }
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
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
        u.rol_id,
        r.nombre as rol_nombre,
        r.slug as rol_slug,
        u.activo,
        u.created_at,
        u.updated_at
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      ORDER BY u.created_at DESC
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

// Obtener un usuario por ID
app.get('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        u.id, 
        u.nombre, 
        u.email, 
        u.rol, 
        u.rol_id,
        r.nombre as rol_nombre,
        r.slug as rol_slug,
        u.activo
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear usuario
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { nombre, email, password, rol, rol_id, activo } = req.body;

    // Validaciones
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
    if (!rol_id) {
      errors.push({ field: 'rol_id', message: 'Debe seleccionar un rol' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si el email ya existe
    const [existingEmail] = await pool.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'email', message: 'El email ya está en uso' }],
        message: 'El email ya está registrado'
      });
    }

    // Hash de la contraseña
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Obtener slug del rol para campo legacy 'rol'
    const [rolData] = await pool.execute(
      'SELECT slug FROM roles WHERE id = ? LIMIT 1',
      [rol_id]
    );
    const rolSlug = rolData.length > 0 ? rolData[0].slug : rol || 'consulta';

    // Insertar usuario
    const [result] = await pool.execute(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, rol_id, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre.trim(), email.toLowerCase(), hashedPassword, rolSlug, rol_id, activo !== false]
    );

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        id: result.insertId,
        nombre: nombre.trim(),
        email: email.toLowerCase(),
        rol: rolSlug,
        rol_id,
        activo: activo !== false
      }
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
    const { nombre, email, password, rol, rol_id, activo } = req.body;

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
    
    // Si se actualiza rol_id, también actualizar el campo legacy 'rol'
    if (rol_id) {
      const [rolData] = await pool.execute(
        'SELECT slug FROM roles WHERE id = ? LIMIT 1',
        [rol_id]
      );
      const rolSlug = rolData.length > 0 ? rolData[0].slug : rol || 'consulta';
      
      updateFields.push('rol_id = ?');
      updateValues.push(rol_id);
      updateFields.push('rol = ?');
      updateValues.push(rolSlug);
    } else if (rol) {
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

    // Eliminar permisos del usuario (si existen en la tabla antigua)
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


const tiposServicioRoute    = require('../routes/tipos-servicio');

// Rutas nuevas/actualizadas que agregamos en esta iteración
const serviciosRoute        = require('../routes/servicios'); // <-- usa el archivo en minúsculas que te pasé
const clientesRoute         = require('../routes/clientes');  // <-- nuevo
const cobrosRoute           = require('../routes/cobros');    // <-- nuevo
const configuracionRoute    = require('../routes/configuracion');
const backupRoute           = require('../routes/backup');
const metodosPagoRoute      = require('../routes/metodos-pago');  // ← NUEVO
const ventasRoute           = require('../routes/ventas');    // <-- usa el archivo en minúsculas

// Usar rutas (orden recomendado)
app.use('/api/zonas',              zonasRoutes);
app.use('/api/familias/import-excel', familiasImportRoute);
app.use('/api/familias',           familiasRoutes);
app.use('/api/cajas',              cajasRoutes);
app.use('/api/campanias',          campaniasRoute);
app.use('/api/modalidades',        modalidadesRoute);
app.use('/api/puntos-venta',       puntosVentaRoute);
app.use('/api/tipos-servicio',     tiposServicioRoute);

// Nuevos/actualizados
app.use('/api/clientes',           clientesRoute);
app.use('/api/servicios',          serviciosRoute);
app.use('/api/cobros',             cobrosRoute);
app.use('/api/metodos-pago',       metodosPagoRoute);  // ← NUEVO
app.use('/api/ventas',             ventasRoute);
app.use('/api/configuracion',      configuracionRoute);
app.use('/api/backup',             backupRoute);



// ==================== SERVIDOR ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`🔒 CORS habilitado para: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
