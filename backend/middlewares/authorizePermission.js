// backend/middlewares/authorizePermission.js
/**
 * Middleware de autorización por permisos
 * 
 * Uso:
 * app.get('/api/reportes', authorizePermission('reportes'), (req, res) => { ... })
 * 
 * También soporta múltiples permisos (cualquiera de ellos):
 * app.get('/api/datos', authorizePermission(['reportes', 'dashboard_cajas']), (req, res) => { ... })
 */

const pool = require('../config/db');

/**
 * Middleware que verifica si el usuario tiene un permiso específico
 * @param {string|string[]} requiredPermissions - Permiso(s) requerido(s)
 * @returns {function} Middleware function
 */
function authorizePermission(requiredPermissions) {
  return async (req, res, next) => {
    try {
      // Si el usuario es admin, permitir siempre
      if (req.user?.rol === 'admin') {
        return next();
      }

      // Convertir a array si es string
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Obtener permisos del usuario desde la BD
      const [userPermissions] = await pool.execute(
        `SELECT p.modulo 
         FROM usuario_permisos up 
         JOIN permisos p ON up.permiso_id = p.id 
         WHERE up.usuario_id = ? AND (up.activo IS NULL OR up.activo = 1) AND (p.activo IS NULL OR p.activo = 1)`,
        [req.user?.id]
      );

      const userPerms = userPermissions.map(p => p.modulo);

      // Verificar si el usuario tiene al menos uno de los permisos requeridos
      const hasPermission = permissions.some(perm => userPerms.includes(perm));

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para acceder a este recurso',
          required: permissions,
          granted: userPerms
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

module.exports = authorizePermission;
