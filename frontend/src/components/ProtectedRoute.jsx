// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Misma matriz que en Sidebar
const ROLE_PERMISSIONS = {
  admin: ['*'],
  supervisor: ['zonas', 'familias', 'campanias', 'modalidades', 'venta_cajas', 'donaciones', 'ingresos', 'reportes', 'usuarios', 'configuracion'],
  operador: ['zonas', 'familias', 'venta_cajas'],
  consulta: ['servicios', 'registrar-servicios'],
};

function hasPermByRole(user, requiredPerm) {
  if (!requiredPerm) return true;
  if (!user) return false;

  const perms = ROLE_PERMISSIONS[user.rol] || [];
  if (perms.includes('*')) return true;

  const required = Array.isArray(requiredPerm) ? requiredPerm : [requiredPerm];
  return required.every((p) => perms.includes(p));
}

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

  // Check por rol
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user.rol)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <p className="text-gray-700 dark:text-gray-200">
            No tienes permisos para acceder a esta sección (rol insuficiente).
          </p>
        </div>
      );
    }
  }

  // Check por permiso derivado del rol
  if (!hasPermByRole(user, requiredPerm)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-200">
          No tienes permisos para acceder a esta sección (módulo restringido).
        </p>
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
