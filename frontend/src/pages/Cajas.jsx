import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cajasService, familiasService, benefactoresService } from '../services/api';

const Cajas = () => {
  const { user } = useAuth();
  const [cajas, setCajas] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [benefactores, setBenefactores] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMasivoModal, setShowMasivoModal] = useState(false);
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [editingCaja, setEditingCaja] = useState(null);
  const [selectedCaja, setSelectedCaja] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [selectedFamilia, setSelectedFamilia] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [formData, setFormData] = useState({
    familia_id: '',
    observaciones: ''
  });
  const [masivoData, setMasivoData] = useState({
    cantidad: '',
    familia_ids: []
  });
  const [asignarData, setAsignarData] = useState({
    benefactor_id: '',
    observaciones: ''
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const estados = [
    { value: 'disponible', label: 'Disponible', color: 'bg-gray-100 text-gray-800' },
    { value: 'asignada', label: 'Asignada', color: 'bg-blue-100 text-blue-800' },
    { value: 'entregada', label: 'Entregada', color: 'bg-green-100 text-green-800' },
    { value: 'devuelta', label: 'Devuelta', color: 'bg-yellow-100 text-yellow-800' }
  ];

  // Cargar datos iniciales
  useEffect(() => {
    loadCajas();
    loadFamilias();
    loadBenefactores();
    loadStats();
  }, [currentPage, searchTerm, selectedEstado, selectedFamilia]);

  const loadCajas = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 20,
        search: searchTerm || undefined,
        estado: selectedEstado || undefined,
        familia_id: selectedFamilia || undefined
      };
      
      const data = await cajasService.getAll(params);
      if (data.success) {
        setCajas(data.data);
        setPagination(data.pagination);
      } else {
        setErrors({ general: data.error || 'Error al cargar cajas' });
      }
    } catch (error) {
      console.error('Error al cargar cajas:', error);
      setErrors({ general: 'Error de conexión al cargar cajas' });
    } finally {
      setLoading(false);
    }
  };

  const loadFamilias = async () => {
    try {
      const data = await familiasService.getAll({ activo: true, limit: 1000 });
      if (data.success) {
        setFamilias(data.data);
      }
    } catch (error) {
      console.error('Error al cargar familias:', error);
    }
  };

  const loadBenefactores = async () => {
    try {
      const data = await benefactoresService.getAll({ activo: true, limit: 1000 });
      if (data.success) {
        setBenefactores(data.data);
      }
    } catch (error) {
      console.error('Error al cargar benefactores:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await cajasService.getStats();
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
      if (editingCaja) {
        data = await cajasService.update(editingCaja.id, formData);
      } else {
        data = await cajasService.create(formData);
      }

      if (data.success) {
        setSuccessMessage(editingCaja ? 'Caja actualizada exitosamente' : 'Caja creada exitosamente');
        setShowModal(false);
        resetForm();
        loadCajas();
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

  const handleMasivoSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    try {
      const data = await cajasService.crearMasivo(masivoData);
      if (data.success) {
        setSuccessMessage(`${data.data.cajas_creadas} cajas creadas exitosamente`);
        setShowMasivoModal(false);
        setMasivoData({ cantidad: '', familia_ids: [] });
        loadCajas();
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
      console.error('Error al crear cajas masivo:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleAsignar = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    try {
      const data = await cajasService.asignar(selectedCaja.id, asignarData);
      if (data.success) {
        setSuccessMessage('Caja asignada exitosamente');
        setShowAsignarModal(false);
        setAsignarData({ benefactor_id: '', observaciones: '' });
        setSelectedCaja(null);
        loadCajas();
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
      console.error('Error al asignar caja:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleCambiarEstado = async (caja, nuevoEstado, observaciones = '') => {
    try {
      let data;
      switch (nuevoEstado) {
        case 'entregada':
          data = await cajasService.entregarBenefactor(caja.id, { observaciones });
          break;
        case 'devuelta':
          data = await cajasService.devolver(caja.id, { observaciones });
          break;
        case 'disponible':
          data = await cajasService.liberar(caja.id, { observaciones });
          break;
        default:
          throw new Error('Estado no válido');
      }

      if (data.success) {
        setSuccessMessage(data.message);
        loadCajas();
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
    if (!confirm('¿Estás seguro de que deseas eliminar esta caja?')) {
      return;
    }

    try {
      const data = await cajasService.delete(id);
      if (data.success) {
        setSuccessMessage('Caja eliminada exitosamente');
        loadCajas();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al eliminar caja:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const resetForm = () => {
    setFormData({
      familia_id: '',
      observaciones: ''
    });
    setEditingCaja(null);
    setErrors({});
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (filterType, value) => {
    if (filterType === 'estado') {
      setSelectedEstado(value);
    } else if (filterType === 'familia') {
      setSelectedFamilia(value);
    }
    setCurrentPage(1);
  };

  const getEstadoStyle = (estado) => {
    const estadoObj = estados.find(e => e.value === estado);
    return estadoObj ? estadoObj.color : 'bg-gray-100 text-gray-800';
  };

  const getEstadoLabel = (estado) => {
    const estadoObj = estados.find(e => e.value === estado);
    return estadoObj ? estadoObj.label : estado;
  };

  if (loading && cajas.length === 0) {
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
          Cajas del Amor
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestión de cajas del programa de ayuda social
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
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Cajas</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Disponibles</h3>
          <p className="text-2xl font-bold text-gray-600">{stats.disponibles || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Asignadas</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.asignadas || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Entregadas</h3>
          <p className="text-2xl font-bold text-green-600">{stats.entregadas || 0}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <input
            type="text"
            placeholder="Buscar cajas..."
            value={searchTerm}
            onChange={handleSearch}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={selectedEstado}
            onChange={(e) => handleFilterChange('estado', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {estados.map(estado => (
              <option key={estado.value} value={estado.value}>{estado.label}</option>
            ))}
          </select>
          <select
            value={selectedFamilia}
            onChange={(e) => handleFilterChange('familia', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todas las familias</option>
            {familias.map(familia => (
              <option key={familia.id} value={familia.id}>
                {familia.codigo_unico} - {familia.nombre_padre || familia.nombre_madre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMasivoModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Crear Masivo
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Nueva Caja
          </button>
        </div>
      </div>

      {/* Tabla de cajas */}
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
                  Benefactor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Fechas
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {cajas.map((caja) => (
                <tr key={caja.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {caja.codigo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {caja.familia_codigo}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {caja.familia_nombre_padre || caja.familia_nombre_madre}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {caja.benefactor_nombre || 'Sin asignar'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEstadoStyle(caja.estado)}`}>
                      {getEstadoLabel(caja.estado)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div className="space-y-1">
                      {caja.fecha_asignacion && (
                        <div>Asignada: {new Date(caja.fecha_asignacion).toLocaleDateString()}</div>
                      )}
                      {caja.fecha_entrega && (
                        <div>Entregada: {new Date(caja.fecha_entrega).toLocaleDateString()}</div>
                      )}
                      {caja.fecha_devolucion && (
                        <div>Devuelta: {new Date(caja.fecha_devolucion).toLocaleDateString()}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {caja.estado === 'disponible' && (
                        <button
                          onClick={() => {
                            setSelectedCaja(caja);
                            setShowAsignarModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Asignar
                        </button>
                      )}
                      {caja.estado === 'asignada' && (
                        <>
                          <button
                            onClick={() => handleCambiarEstado(caja, 'entregada', 'Entregada al benefactor')}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Entregar
                          </button>
                          <button
                            onClick={() => handleCambiarEstado(caja, 'disponible', 'Liberada por cancelación')}
                            className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                          >
                            Liberar
                          </button>
                        </>
                      )}
                      {caja.estado === 'entregada' && (
                        <button
                          onClick={() => handleCambiarEstado(caja, 'devuelta', 'Devuelta por el benefactor')}
                          className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300"
                        >
                          Devolver
                        </button>
                      )}
                      {(caja.estado === 'disponible' || caja.estado === 'devuelta') && (
                        <button
                          onClick={() => handleDelete(caja.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cajas.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || selectedEstado || selectedFamilia ? 'No se encontraron cajas que coincidan con los filtros.' : 'No hay cajas registradas.'}
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

      {/* Modal de Nueva Caja */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Nueva Caja
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Familia *
                  </label>
                  <select
                    value={formData.familia_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, familia_id: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.familia_id ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="">Seleccionar familia</option>
                    {familias.map(familia => (
                      <option key={familia.id} value={familia.id}>
                        {familia.codigo_unico} - {familia.nombre_padre || familia.nombre_madre}
                      </option>
                    ))}
                  </select>
                  {errors.familia_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.familia_id}</p>
                  )}
                </div>

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
                    Crear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Creación Masiva */}
      {showMasivoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Crear Cajas Masivo
                </h2>
                <button
                  onClick={() => setShowMasivoModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleMasivoSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cantidad de cajas por familia *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={masivoData.cantidad}
                    onChange={(e) => setMasivoData(prev => ({ ...prev, cantidad: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.cantidad ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Número de cajas"
                    required
                  />
                  {errors.cantidad && (
                    <p className="mt-1 text-sm text-red-600">{errors.cantidad}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Familias *
                  </label>
                  <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-lg p-2 dark:border-gray-600">
                    {familias.map(familia => (
                      <label key={familia.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                        <input
                          type="checkbox"
                          checked={masivoData.familia_ids.includes(familia.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMasivoData(prev => ({
                                ...prev,
                                familia_ids: [...prev.familia_ids, familia.id]
                              }));
                            } else {
                              setMasivoData(prev => ({
                                ...prev,
                                familia_ids: prev.familia_ids.filter(id => id !== familia.id)
                              }));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {familia.codigo_unico} - {familia.nombre_padre || familia.nombre_madre}
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.familia_ids && (
                    <p className="mt-1 text-sm text-red-600">{errors.familia_ids}</p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowMasivoModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Crear Cajas
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Asignar Caja */}
      {showAsignarModal && selectedCaja && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Asignar Caja {selectedCaja.codigo}
                </h2>
                <button
                  onClick={() => setShowAsignarModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAsignar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Benefactor *
                  </label>
                  <select
                    value={asignarData.benefactor_id}
                    onChange={(e) => setAsignarData(prev => ({ ...prev, benefactor_id: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.benefactor_id ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="">Seleccionar benefactor</option>
                    {benefactores.map(benefactor => (
                      <option key={benefactor.id} value={benefactor.id}>
                        {benefactor.nombre} - {benefactor.dni}
                      </option>
                    ))}
                  </select>
                  {errors.benefactor_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.benefactor_id}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={asignarData.observaciones}
                    onChange={(e) => setAsignarData(prev => ({ ...prev, observaciones: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Observaciones de la asignación"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAsignarModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Asignar
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

export default Cajas;

