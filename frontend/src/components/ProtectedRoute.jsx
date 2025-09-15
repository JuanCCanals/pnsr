import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Mensaje unificado de acceso denegado
const NoAccess = ({ reason, extra }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800">
    <div className="text-center p-8">
      <div className="text-6xl mb-4">🚫</div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Acceso Denegado</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-2">{reason || 'No tienes permisos para acceder a esta página.'}</p>
      {extra && <p className="text-sm text-gray-500 dark:text-gray-400">{extra}</p>}
    </div>
  </div>
);

/**
 * Protege rutas por autenticación, rol y/o permisos (slug de módulo).
 *
 * Props:
 *  - requiredRole: string | string[]   (ej. 'admin' o ['admin','operador'])
 *  - requiredPerm: string | string[]   (slug(s) de permisos, ej. 'familias', 'zonas')
 */
const ProtectedRoute = ({ children, requiredRole = null, requiredPerm = null }) => {
  const { isAuthenticated, isLoading, hasRole, user, hasPerm } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 1) Gate por rol (si fue especificado)
  if (requiredRole && !hasRole(requiredRole)) {
    const needed = Array.isArray(requiredRole) ? requiredRole.join(' o ') : requiredRole;
    return <NoAccess reason="Tu rol no permite acceder a este módulo." extra={`Rol requerido: ${needed}`} />;
  }

  // 2) Gate por permiso de módulo (si fue especificado)
  if (requiredPerm && user?.rol !== 'admin') {
    const needed = Array.isArray(requiredPerm) ? requiredPerm : [requiredPerm];

    // Si tu AuthContext expone hasPerm, úsalo; si no, calculamos con user.permisos
    let ok = false;
    if (typeof hasPerm === 'function') {
      ok = needed.some(p => hasPerm(p));
    } else {
      const granted =
        (user?.permisos || []).map(p => p.modulo ?? p.nombre); // admite { modulo } o { nombre }
      ok = needed.some(p => granted.includes(p));
    }

    if (!ok) {
      const neededStr = needed.join(' o ');
      return <NoAccess reason="No tienes acceso a este módulo." extra={`Permiso requerido: ${neededStr}`} />;
    }
  }

  return children;
};

// Solo-públicas (p.ej. /login)
export const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Cargando...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

// HOC por rol (se mantiene igual)
export const withRoleProtection = (Component, requiredRole) => {
  return (props) => (
    <ProtectedRoute requiredRole={requiredRole}>
      <Component {...props} />
    </ProtectedRoute>
  );
};

export default ProtectedRoute;
