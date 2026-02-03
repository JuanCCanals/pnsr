// frontend/src/components/Configuracion/RolesPermisosTab.jsx
import React, { useState, useEffect } from 'react';
import { rolesService } from '../../services/api'; // ✅ CAMBIO: Usar servicio centralizado
import RolModal from './RolModal';
import PermisosModal from './PermisosModal';

const RolesPermisosTab = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRol, setSelectedRol] = useState(null);
  const [showRolModal, setShowRolModal] = useState(false);
  const [showPermisosModal, setShowPermisosModal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      // ✅ CAMBIO: Usar rolesService en lugar de axios directo
      const response = await rolesService.getAll();
      
      if (response.success) {
        setRoles(response.data);
      }
    } catch (error) {
      console.error('Error cargando roles:', error);
      setError('Error al cargar los roles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRol = () => {
    setSelectedRol(null);
    setShowRolModal(true);
  };

  const handleEditRol = (rol) => {
    setSelectedRol(rol);
    setShowRolModal(true);
  };

  const handleManagePermisos = (rol) => {
    setSelectedRol(rol);
    setShowPermisosModal(true);
  };

  const handleDeleteRol = async (rol) => {
    if (rol.slug === 'admin') {
      alert('No se puede eliminar el rol de administrador');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar el rol "${rol.nombre}"?`)) {
      return;
    }

    try {
      // ✅ CAMBIO: Usar rolesService
      await rolesService.delete(rol.id);
      
      alert('Rol eliminado exitosamente');
      loadRoles();
    } catch (error) {
      console.error('Error eliminando rol:', error);
      alert(error.response?.data?.message || 'Error al eliminar el rol');
    }
  };

  const handleRolSaved = () => {
    setShowRolModal(false);
    loadRoles();
  };

  const handlePermisosSaved = () => {
    setShowPermisosModal(false);
    loadRoles();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-300">Cargando roles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con botón crear */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Gestión de Roles y Permisos
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Crea y configura roles con permisos granulares (CRUD) por módulo
          </p>
        </div>
        <button
          onClick={handleCreateRol}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span className="text-xl">➕</span>
          Nuevo Rol
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Tabla de roles */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Descripción
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Permisos
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Usuarios
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {roles.map((rol) => (
              <tr key={rol.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {rol.nombre}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {rol.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {rol.descripcion || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {rol.total_permisos || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    {rol.total_usuarios || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {rol.es_admin ? (
                    <span className="text-green-600 dark:text-green-400 text-xl">✓</span>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      rol.activo
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}
                  >
                    {rol.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => handleManagePermisos(rol)}
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Gestionar permisos"
                  >
                    🔐
                  </button>
                  <button
                    onClick={() => handleEditRol(rol)}
                    className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                    title="Editar rol"
                  >
                    ✏️
                  </button>
                  {rol.slug !== 'admin' && (
                    <button
                      onClick={() => handleDeleteRol(rol)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      title="Eliminar rol"
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {roles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No hay roles configurados</p>
          </div>
        )}
      </div>

      {/* Información adicional */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
          💡 Información sobre permisos
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• <strong>Admin</strong>: Los roles con acceso de administrador tienen permisos totales automáticamente</li>
          <li>• <strong>Permisos granulares</strong>: Puedes configurar permisos específicos (crear, leer, actualizar, eliminar) por cada módulo</li>
          <li>• <strong>Usuarios</strong>: Al crear o editar un usuario, se le asigna un rol que determina sus permisos</li>
        </ul>
      </div>

      {/* Modales */}
      {showRolModal && (
        <RolModal
          rol={selectedRol}
          onClose={() => setShowRolModal(false)}
          onSave={handleRolSaved}
        />
      )}

      {showPermisosModal && (
        <PermisosModal
          rol={selectedRol}
          onClose={() => setShowPermisosModal(false)}
          onSave={handlePermisosSaved}
        />
      )}
    </div>
  );
};

export default RolesPermisosTab;
