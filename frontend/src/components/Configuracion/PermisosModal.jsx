// frontend/src/components/Configuracion/PermisosModal.jsx
import React, { useState, useEffect } from 'react';
import { rolesService } from '../../services/api'; // ✅ CAMBIO: Usar servicio centralizado

const PermisosModal = ({ rol, onClose, onSave }) => {
  const [modulos, setModulos] = useState([]);
  const [permisosSeleccionados, setPermisosSeleccionados] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPermisosData();
  }, [rol]);

  const loadPermisosData = async () => {
    try {
      setLoading(true);

      // ✅ CAMBIO: Usar rolesService
      const response = await rolesService.getPermisos(rol.id);
      
      if (response.success) {
        setModulos(response.data);
        
        // Crear set con los permisos ya asignados
        const asignados = new Set();
        response.data.forEach(modulo => {
          modulo.permisos.forEach(permiso => {
            if (permiso.asignado) {
              asignados.add(permiso.permiso_id);
            }
          });
        });
        setPermisosSeleccionados(asignados);
      }
    } catch (error) {
      console.error('Error cargando permisos:', error);
      setError('Error al cargar permisos del rol');
    } finally {
      setLoading(false);
    }
  };

  const handlePermisoToggle = (permisoId) => {
    setPermisosSeleccionados(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permisoId)) {
        newSet.delete(permisoId);
      } else {
        newSet.add(permisoId);
      }
      return newSet;
    });
  };

  const handleModuloToggle = (modulo) => {
    const todosSeleccionados = modulo.permisos.every(p => permisosSeleccionados.has(p.permiso_id));
    
    setPermisosSeleccionados(prev => {
      const newSet = new Set(prev);
      modulo.permisos.forEach(permiso => {
        if (todosSeleccionados) {
          newSet.delete(permiso.permiso_id);
        } else {
          newSet.add(permiso.permiso_id);
        }
      });
      return newSet;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      // ✅ CAMBIO: Usar rolesService
      await rolesService.updatePermisos(rol.id, Array.from(permisosSeleccionados));

      onSave();
    } catch (error) {
      console.error('Error guardando permisos:', error);
      setError(error.response?.data?.message || 'Error al guardar permisos');
      setSaving(false);
    }
  };

  const getAccionIcon = (accion) => {
    const icons = {
      crear: '➕',
      leer: '👁️',
      actualizar: '✏️',
      eliminar: '🗑️',
      exportar: '📥',
      importar: '📤'
    };
    return icons[accion] || '◼';
  };

  const getAccionLabel = (accion) => {
    const labels = {
      crear: 'Crear',
      leer: 'Ver',
      actualizar: 'Editar',
      eliminar: 'Eliminar',
      exportar: 'Exportar',
      importar: 'Importar'
    };
    return labels[accion] || accion;
  };

  const getCategoriaColor = (categoria) => {
    const colors = {
      'campaña_cajas': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'servicios': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'reportes': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'administracion': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'general': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    };
    return colors[categoria] || colors['general'];
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-700 dark:text-gray-200">Cargando permisos...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Gestionar Permisos: {rol.nombre}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Selecciona los permisos que tendrá este rol en cada módulo
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {rol.es_admin && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Este rol tiene acceso de administrador. Los permisos individuales no se aplicarán ya que tiene acceso total al sistema.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {modulos.map((modulo) => {
              const todosSeleccionados = modulo.permisos.every(p => permisosSeleccionados.has(p.permiso_id));
              const algunosSeleccionados = modulo.permisos.some(p => permisosSeleccionados.has(p.permiso_id)) && !todosSeleccionados;

              return (
                <div key={modulo.modulo_id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Header del módulo */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={todosSeleccionados}
                        ref={input => {
                          if (input) input.indeterminate = algunosSeleccionados;
                        }}
                        onChange={() => handleModuloToggle(modulo)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {modulo.modulo_nombre}
                        </h4>
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${getCategoriaColor(modulo.categoria)}`}>
                          {modulo.categoria}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {modulo.permisos.filter(p => permisosSeleccionados.has(p.permiso_id)).length} / {modulo.permisos.length} seleccionados
                    </span>
                  </div>

                  {/* Permisos del módulo */}
                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {modulo.permisos.map((permiso) => (
                      <label
                        key={permiso.permiso_id}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                          permisosSeleccionados.has(permiso.permiso_id)
                            ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'
                            : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={permisosSeleccionados.has(permiso.permiso_id)}
                          onChange={() => handlePermisoToggle(permiso.permiso_id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-lg">{getAccionIcon(permiso.accion)}</span>
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          {getAccionLabel(permiso.accion)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {modulos.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No hay módulos disponibles</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || rol.es_admin}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar Permisos'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermisosModal;
