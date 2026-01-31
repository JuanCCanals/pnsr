// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ✅ ACTUALIZADO: ProtectedRoute para sistema RBAC dinámico
 * Ahora verifica permisos desde user.permisos y user.rol.es_admin
 */

export default function ProtectedRoute({ children, requiredRole, requiredPerm }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-200">Verificando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ✅ NUEVO: Función para obtener el slug del rol
  const getRolSlug = () => {
    if (typeof user.rol === 'object' && user.rol !== null) {
      return user.rol.slug || '';
    }
    return user.rol || '';
  };

  // ✅ NUEVO: Verificar si es admin
  const isAdmin = () => {
    if (typeof user.rol === 'object' && user.rol !== null) {
      return user.rol.es_admin === true;
    }
    // Compatibilidad con sistema antiguo
    return user.rol === 'admin';
  };

  // ✅ NUEVO: Verificar permisos usando los permisos del backend
  const hasPermission = (permSlug) => {
    if (!permSlug) return true;

    // Si es admin, tiene acceso a todo
    if (isAdmin()) return true;

    // Si tiene permisos wildcard
    if (user.permisos?.includes('*')) return true;

    // Si permSlug es un array, verificar que tenga al menos uno
    if (Array.isArray(permSlug)) {
      return permSlug.some(p => {
        // Verificar si tiene algún permiso que empiece con el slug del módulo
        return user.permisos?.some(up => up.startsWith(`${p}.`));
      });
    }

    // Verificar si tiene algún permiso que empiece con el slug del módulo
    return user.permisos?.some(p => p.startsWith(`${permSlug}.`)) || false;
  };

  // ✅ ACTUALIZADO: Check por rol (ahora maneja objeto)
  if (requiredRole) {
    const rolSlug = getRolSlug();
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    // Admin siempre pasa
    if (isAdmin()) {
      // Continuar con el siguiente check
    } else if (!roles.includes(rolSlug)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center p-8">
            <p className="text-gray-700 dark:text-gray-200 text-lg mb-4">
              No tienes permisos para acceder a esta sección
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Se requiere uno de los siguientes roles: {roles.join(', ')}
            </p>
            <button
              onClick={() => window.history.back()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      );
    }
  }

  // ✅ ACTUALIZADO: Check por permiso (ahora usa permisos dinámicos del backend)
  if (requiredPerm && !hasPermission(requiredPerm)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center p-8">
          <p className="text-gray-700 dark:text-gray-200 text-lg mb-4">
            No tienes permisos para acceder a esta sección
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Se requiere permiso: {Array.isArray(requiredPerm) ? requiredPerm.join(' o ') : requiredPerm}
          </p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return children;
}

export function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-200">Cargando...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
