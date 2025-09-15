import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { familiasService, zonasService } from '../services/api';

const Familias = () => {
  const { user } = useAuth();
  const [familias, setFamilias] = useState([]);
  const [importZonaId, setImportZonaId] = useState('');
  const [zonas, setZonas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZona, setSelectedZona] = useState('');
  const [selectedActivo, setSelectedActivo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [formData, setFormData] = useState({
    nombre_padre: '',
    nombre_madre: '',
    direccion: '',
    zona_id: '',
    telefono: '',
    observaciones: '',
    integrantes: []
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadFamilias();
    loadZonas();
    loadStats();
  }, [currentPage, searchTerm, selectedZona, selectedActivo]);

  const loadFamilias = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 20,
        search: searchTerm || undefined,
        zona_id: selectedZona || undefined,
        activo: selectedActivo || undefined
      };
      
      const data = await familiasService.getAll(params);
      if (data.success) {
        setFamilias(data.data);
        setPagination(data.pagination);
      } else {
        setErrors({ general: data.error || 'Error al cargar familias' });
      }
    } catch (error) {
      console.error('Error al cargar familias:', error);
      setErrors({ general: 'Error de conexión al cargar familias' });
    } finally {
      setLoading(false);
    }
  };

  const loadZonas = async () => {
    try {
      const data = await zonasService.getAll();
      if (data.success) {
        setZonas(data.data.filter(zona => zona.activo));
      }
    } catch (error) {
      console.error('Error al cargar zonas:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await familiasService.getStats();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    try {
      let data;
      if (editingFamily) {
        data = await familiasService.update(editingFamily.id, formData);
      } else {
        data = await familiasService.create(formData);
      }

      if (data.success) {
        setSuccessMessage(editingFamily ? 'Familia actualizada exitosamente' : 'Familia creada exitosamente');
        setShowModal(false);
        resetForm();
        loadFamilias();
        loadStats();
      } else {
        if (data.errors) {
          const errorObj = {};
          data.errors.forEach(error => {
            errorObj[error.field] = error.message;
          });
          setErrors(errorObj);
        } else {
          setErrors({ general: data.message || data.error });
        }
      }
    } catch (error) {
      console.error('Error al enviar formulario:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleEdit = (familia) => {
    setEditingFamily(familia);
    setFormData({
      nombre_padre: familia.nombre_padre || '',
      nombre_madre: familia.nombre_madre || '',
      direccion: familia.direccion || '',
      zona_id: familia.zona_id || '',
      telefono: familia.telefono || '',
      observaciones: familia.observaciones || '',
      integrantes: []
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (id) => {
    try {
      const data = await familiasService.toggleStatus(id);
      if (data.success) {
        setSuccessMessage(data.message);
        loadFamilias();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta familia?')) {
      return;
    }

    try {
      const data = await familiasService.delete(id);
      if (data.success) {
        setSuccessMessage('Familia eliminada exitosamente');
        loadFamilias();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al eliminar familia:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleImportExcel = async (e) => {
    e.preventDefault();

    if (!importFile) {
    setErrors({ import: 'Selecciona un archivo Excel (.xlsx)' });
      return;
    }

    if (!importZonaId) {
      setErrors({ import: 'Selecciona la zona para este lote de importación' });
      return;
    }

    setImportLoading(true);
    setErrors({});

    try {
      const formData = new FormData();
      // Usamos 'file' para que multer.any() lo reciba sin problemas
      formData.append('file', importFile);
      formData.append('zona_id', importZonaId);  // zona elegida en el select

      // Llamada al backend; devuelve { message: 'Importación completada exitosamente' }
      const result = await familiasService.importExcel(formData);
      const msg = result.message || 'Importación completada exitosamente';
      setSuccessMessage(msg);
      setShowImportModal(false);
      setImportFile(null);
      setImportZonaId('');
      // Limpiar filtros para que veas los nuevos registros
      setSearchTerm('');
      setSelectedZona('');
      setSelectedActivo('');
      // Recargar la lista y estadísticas
      await loadFamilias();
      await loadStats();

    } catch (error) {
      console.error('Error al importar Excel:', error);
      const msg = error.response?.data?.message || 'Error de conexión durante la importación';
      setErrors({ import: msg });
    } finally {
      setImportLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre_padre: '',
      nombre_madre: '',
      direccion: '',
      zona_id: '',
      telefono: '',
      observaciones: '',
      integrantes: []
    });
    setEditingFamily(null);
    setErrors({});
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (filterType, value) => {
    if (filterType === 'zona') {
      setSelectedZona(value);
    } else if (filterType === 'activo') {
      setSelectedActivo(value);
    }
    setCurrentPage(1);
  };

  if (loading && familias.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Gestión de Familias
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Administra las familias beneficiarias del programa
        </p>
      </div>

      {/* Mensajes */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {successMessage}
        </div>
      )}

      {errors.general && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {errors.general}
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Familias</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Activas</h3>
          <p className="text-2xl font-bold text-green-600">{stats.activas || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Integrantes</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total_integrantes || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Promedio Integrantes</h3>
          <p className="text-2xl font-bold text-purple-600">{stats.promedio_integrantes || 0}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <input
            type="text"
            placeholder="Buscar familias..."
            value={searchTerm}
            onChange={handleSearch}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={selectedZona}
            onChange={(e) => handleFilterChange('zona', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todas las zonas</option>
            {zonas.map(zona => (
              <option key={zona.id} value={zona.id}>{zona.nombre}</option>
            ))}
          </select>
          <select
            value={selectedActivo}
            onChange={(e) => handleFilterChange('activo', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Importar Excel
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Nueva Familia
          </button>
        </div>
      </div>

      {/* Tabla de familias */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Familia
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Zona
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Dirección
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Integrantes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {familias.map((familia) => (
                <tr key={familia.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {familia.codigo_unico}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {familia.nombre_padre && `${familia.nombre_padre}`}
                        {familia.nombre_padre && familia.nombre_madre && ' / '}
                        {familia.nombre_madre && `${familia.nombre_madre}`}
                      </div>
                      {familia.telefono && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {familia.telefono}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {familia.zona_nombre}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-xs truncate">
                    {familia.direccion}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {familia.total_integrantes || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      familia.activo 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {familia.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleEdit(familia)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleStatus(familia.id)}
                        className={`${
                          familia.activo 
                            ? 'text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300'
                            : 'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300'
                        }`}
                      >
                        {familia.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleDelete(familia.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {familias.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || selectedZona || selectedActivo ? 'No se encontraron familias que coincidan con los filtros.' : 'No hay familias registradas.'}
            </p>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} resultados
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Anterior
            </button>
            <span className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md">
              {pagination.page}
            </span>
            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal de Nueva/Editar Familia */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingFamily ? 'Editar Familia' : 'Nueva Familia'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nombre Padre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre del Padre
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_padre}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_padre: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.nombre_padre ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Nombre completo del padre"
                  />
                  {errors.nombre_padre && (
                    <p className="mt-1 text-sm text-red-600">{errors.nombre_padre}</p>
                  )}
                </div>

                {/* Nombre Madre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre de la Madre
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_madre}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_madre: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.nombre_madre ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Nombre completo de la madre"
                  />
                  {errors.nombre_madre && (
                    <p className="mt-1 text-sm text-red-600">{errors.nombre_madre}</p>
                  )}
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Dirección *
                  </label>
                  <input
                    type="text"
                    value={formData.direccion}
                    onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.direccion ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Dirección completa de la familia"
                    required
                  />
                  {errors.direccion && (
                    <p className="mt-1 text-sm text-red-600">{errors.direccion}</p>
                  )}
                </div>

                {/* Zona */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Zona *
                  </label>
                  <select
                    value={formData.zona_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, zona_id: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.zona_id ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="">Seleccionar zona</option>
                    {zonas.map(zona => (
                      <option key={zona.id} value={zona.id}>{zona.nombre}</option>
                    ))}
                  </select>
                  {errors.zona_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.zona_id}</p>
                  )}
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Número de teléfono"
                  />
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Observaciones adicionales"
                  />
                </div>

                {/* Botones */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {editingFamily ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importar Excel */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Importar Familias desde Excel
                </h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleImportExcel} className="space-y-4">

              <div>
                  <label className="block text-sm font-medium mb-1">Zona *</label>
                  <select
                    value={importZonaId}
                    onChange={(e) => setImportZonaId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    required
                  >
                    <option value="">Seleccionar zona…</option>
                    {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                  </select>
                </div>


                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Archivo Excel *
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setImportFile(e.target.files[0])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    required
                  />
                  {errors.import && (
                    <p className="mt-1 text-sm text-red-600">{errors.import}</p>
                  )}
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p className="mb-2">Formato esperado:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Columnas: Nº FAMILIA, NOMBRE PADRE, APELLIDOS PADRE, etc.</li>
                    <li>Una fila por integrante de familia</li>
                    <li>Los datos de familia se repiten en cada fila</li>
                  </ul>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importLoading ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Familias;

