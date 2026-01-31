// frontend/src/components/Configuracion/RolModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const RolModal = ({ rol, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    nombre: '',
    slug: '',
    descripcion: '',
    es_admin: false,
    activo: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (rol) {
      setFormData({
        nombre: rol.nombre || '',
        slug: rol.slug || '',
        descripcion: rol.descripcion || '',
        es_admin: rol.es_admin || false,
        activo: rol.activo !== undefined ? rol.activo : true
      });
    }
  }, [rol]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Auto-generar slug desde el nombre
    if (name === 'nombre' && !rol) {
      const slug = value
        .toLowerCase()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      if (rol) {
        // Actualizar rol existente
        await axios.put(`http://localhost:3001/api/roles/${rol.id}`, formData, config);
      } else {
        // Crear nuevo rol
        await axios.post('http://localhost:3001/api/roles', formData, config);
      }

      onSave();
    } catch (error) {
      console.error('Error guardando rol:', error);
      setError(error.response?.data?.message || 'Error al guardar el rol');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {rol ? 'Editar Rol' : 'Crear Nuevo Rol'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre del Rol <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Ej: Operador de Ventas"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slug (identificador) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              required
              disabled={!!rol} // No se puede cambiar el slug de un rol existente
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              placeholder="Ej: operador_ventas"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Solo letras minúsculas, números y guiones bajos
            </p>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripción
            </label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Describe las responsabilidades de este rol..."
            />
          </div>

          {/* Es Admin */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="es_admin"
              id="es_admin"
              checked={formData.es_admin}
              onChange={handleChange}
              disabled={rol?.slug === 'admin'} // No se puede quitar admin al rol admin
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed"
            />
            <label htmlFor="es_admin" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Acceso de Administrador (acceso total al sistema)
            </label>
          </div>

          {/* Activo */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="activo"
              id="activo"
              checked={formData.activo}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="activo" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Rol activo
            </label>
          </div>

          {/* Información adicional */}
          {formData.es_admin && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Los usuarios con este rol tendrán acceso completo a todas las funcionalidades del sistema.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : (rol ? 'Actualizar' : 'Crear Rol')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RolModal;
