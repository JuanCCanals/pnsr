// backend/middlewares/authorizePermission.js
/**
 * Middleware de autorización por permisos dinámicos (RBAC)
 * 
 * FIX: Ahora consulta TANTO rol_permisos COMO usuario_permisos (overrides individuales)
 * FIX: Documentación actualizada para reflejar formato correcto de uso
 * 
 * Uso en rutas:
 * - Verificar acceso a un módulo completo (cualquier permiso del módulo):
 *   router.get('/api/zonas', authenticateToken, authorizePermission('zonas'), ...)
 * 
 * - Verificar permiso específico (acción):
 *   router.post('/api/zonas', authenticateToken, authorizePermission('zonas.crear'), ...)
 *   router.put('/api/zonas/:id', authenticateToken, authorizePermission('zonas.actualizar'), ...)
 *   router.delete('/api/zonas/:id', authenticateToken, authorizePermission('zonas.eliminar'), ...)
 * 
 * - Verificar múltiples permisos (cualquiera de ellos):
 *   router.get('/api/datos', authorizePermission(['reportes.leer', 'dashboard.leer']), ...)
 * 
 * IMPORTANTE: La función acepta UN solo argumento (string o array).
 *   ❌ INCORRECTO: authorizePermission('zonas', 'crear')  ← segundo arg se ignora
 *   ✅ CORRECTO:   authorizePermission('zonas.crear')
 */

const pool = require('../config/db');

/**
 * Caché de permisos por usuario (evita consultas repetidas)
 * Estructura: { usuario_id: { permisos: Set(['zonas_crear', 'zonas_leer', ...]), timestamp } }
 */
const permissionsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Limpiar caché de permisos de un usuario
 * @param {number} userId 
 */
function clearUserPermissionsCache(userId) {
  permissionsCache.delete(userId);
}

/**
 * Limpiar toda la caché de permisos
 */
function clearAllPermissionsCache() {
  permissionsCache.clear();
}

/**
 * Obtener permisos de un usuario desde BD (con caché)
 * Combina permisos del ROL + permisos individuales del USUARIO
 * @param {number} userId 
 * @returns {Promise<Set<string>>} Set de slugs de permisos
 */
async function getUserPermissions(userId) {
  // Verificar caché
  const cached = permissionsCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.permisos;
  }

  try {
    // FIX: Consultar permisos del ROL + permisos individuales del USUARIO
    // Usa UNION para combinar ambas fuentes de permisos
    const [rows] = await pool.execute(`
      SELECT DISTINCT p.slug
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      JOIN rol_permisos rp ON r.id = rp.rol_id
      JOIN permisos p ON rp.permiso_id = p.id
      WHERE u.id = ? 
        AND u.activo = TRUE 
        AND r.activo = TRUE
        AND p.activo = TRUE
      
      UNION
      
      SELECT DISTINCT p.slug
      FROM usuario_permisos up
      JOIN permisos p ON up.permiso_id = p.id
      WHERE up.usuario_id = ?
        AND up.activo = TRUE
        AND p.activo = TRUE
    `, [userId, userId]);

    const permisos = new Set(rows.map(row => row.slug).filter(Boolean));

    // Guardar en caché
    permissionsCache.set(userId, {
      permisos,
      timestamp: Date.now()
    });

    return permisos;
  } catch (error) {
    console.error('Error obteniendo permisos del usuario:', error);
    return new Set();
  }
}

/**
 * Verificar si un usuario es administrador
 * @param {number} userId 
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
  try {
    const [rows] = await pool.execute(`
      SELECT r.es_admin
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      WHERE u.id = ? AND u.activo = TRUE AND r.activo = TRUE
    `, [userId]);

    return rows.length > 0 && rows[0].es_admin === 1;
  } catch (error) {
    console.error('Error verificando si es admin:', error);
    return false;
  }
}

/**
 * Middleware que verifica si el usuario tiene un permiso específico
 * @param {string|string[]} requiredPermissions - Permiso(s) requerido(s)
 *   Formato: 'modulo.accion', 'modulo' (cualquier acción), o ['perm1', 'perm2']
 * @returns {function} Middleware function
 */
function authorizePermission(requiredPermissions) {
  return async (req, res, next) => {
    try {
      // Verificar que el usuario esté autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const userId = req.user.id;

      // Si el usuario es admin, permitir siempre
      if (await isAdmin(userId)) {
        return next();
      }

      // Convertir a array si es string
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Si no se requieren permisos específicos, permitir acceso
      if (permissions.length === 0 || permissions[0] === '*') {
        return next();
      }

      // Obtener permisos del usuario
      const userPermissions = await getUserPermissions(userId);

      // Verificar si el usuario tiene al menos uno de los permisos requeridos
      const hasPermission = permissions.some(perm => {
        // Si el permiso es solo el módulo (ej: 'zonas'), verificar si tiene algún permiso de ese módulo
        if (!perm.includes('.') && !perm.includes('_')) {
          return Array.from(userPermissions).some(up => up.startsWith(`${perm}_`));
        }

        // Convertir formato 'modulo.accion' a 'modulo_accion' para compatibilidad con BD
        const permSlug = perm.replace('.', '_');

        // Verificar permiso exacto (buscar tanto con punto como con guión bajo)
        return userPermissions.has(permSlug) || userPermissions.has(perm);
      });

      if (!hasPermission) {
        console.warn(`⛔ Usuario ${userId} sin permiso:`, permissions, '| Tiene:', Array.from(userPermissions));
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para acceder a este recurso'
        });
      }

      next();
    } catch (error) {
      console.error('Error en authorizePermission:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar permisos'
      });
    }
  };
}

/**
 * Middleware para verificar acceso a una acción específica de un módulo
 * Uso: authorizeAction('zonas', 'crear')
 */
function authorizeAction(modulo, accion) {
  return authorizePermission(`${modulo}.${accion}`);
}

/**
 * Verificar permisos sin middleware (para uso interno)
 * @param {number} userId 
 * @param {string|string[]} permissions 
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, permissions) {
  try {
    if (await isAdmin(userId)) {
      return true;
    }

    const perms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = await getUserPermissions(userId);

    return perms.some(perm => {
      if (!perm.includes('.') && !perm.includes('_')) {
        return Array.from(userPerms).some(up => up.startsWith(`${perm}_`));
      }
      const permSlug = perm.replace('.', '_');
      return userPerms.has(permSlug) || userPerms.has(perm);
    });
  } catch (error) {
    console.error('Error verificando permiso:', error);
    return false;
  }
}

// Exportar funciones
module.exports = authorizePermission;
module.exports.authorizeAction = authorizeAction;
module.exports.hasPermission = hasPermission;
module.exports.clearUserPermissionsCache = clearUserPermissionsCache;
module.exports.clearAllPermissionsCache = clearAllPermissionsCache;
module.exports.getUserPermissions = getUserPermissions;
module.exports.isAdmin = isAdmin;
