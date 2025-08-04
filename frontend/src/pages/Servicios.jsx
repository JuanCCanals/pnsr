import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { serviciosService } from '../services/api';

const Servicios = () => {
  const { user } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [formasPago, setFormasPago] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingServicio, setEditingServicio] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [formData, setFormData] = useState({
    tipo_servicio: '',
    fecha_servicio: '',
    hora_servicio: '',
    nombre_solicitante: '',
    telefono_solicitante: '',
    email_solicitante: '',
    descripcion: '',
    monto_soles: '',
    monto_dolares: '',
    estado_pago: 'pendiente',
    forma_pago: '',
    observaciones: ''
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const estadosPago = [
    { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'pagado', label: 'Pagado', color: 'bg-green-100 text-green-800' },
    { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-800' }
  ];

  // Cargar datos iniciales
  useEffect(() => {
    loadServicios();
    loadTiposServicio();
    loadFormasPago();
    loadStats();
  }, [currentPage, searchTerm, selectedTipo, selectedEstado, fechaDesde, fechaHasta]);

  const loadServicios = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 20,
        search: searchTerm || undefined,
        tipo_servicio: selectedTipo || undefined,
        estado_pago: selectedEstado || undefined,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined
      };
      
      const data = await serviciosService.getAll(params);
      if (data.success) {
        setServicios(data.data);
        setPagination(data.pagination);
      } else {
        setErrors({ general: data.error || 'Error al cargar servicios' });
      }
    } catch (error) {
      console.error('Error al cargar servicios:', error);
      setErrors({ general: 'Error de conexión al cargar servicios' });
    } finally {
      setLoading(false);
    }
  };

  const loadTiposServicio = async () => {
    try {
      const data = await serviciosService.getTipos();
      if (data.success) {
        setTiposServicio(data.data);
      }
    } catch (error) {
      console.error('Error al cargar tipos de servicio:', error);
    }
  };

  const loadFormasPago = async () => {
    try {
      const data = await serviciosService.getFormasPago();
      if (data.success) {
        setFormasPago(data.data);
      }
    } catch (error) {
      console.error('Error al cargar formas de pago:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await serviciosService.getStats();
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
      if (editingServicio) {
        data = await serviciosService.update(editingServicio.id, formData);
      } else {
        data = await serviciosService.create(formData);
      }

      if (data.success) {
        setSuccessMessage(editingServicio ? 'Servicio actualizado exitosamente' : 'Servicio creado exitosamente');
        setShowModal(false);
        resetForm();
        loadServicios();
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

  const handleEdit = (servicio) => {
    setEditingServicio(servicio);
    setFormData({
      tipo_servicio: servicio.tipo_servicio || '',
      fecha_servicio: servicio.fecha_servicio ? servicio.fecha_servicio.split('T')[0] : '',
      hora_servicio: servicio.hora_servicio || '',
      nombre_solicitante: servicio.nombre_solicitante || '',
      telefono_solicitante: servicio.telefono_solicitante || '',
      email_solicitante: servicio.email_solicitante || '',
      descripcion: servicio.descripcion || '',
      monto_soles: servicio.monto_soles || '',
      monto_dolares: servicio.monto_dolares || '',
      estado_pago: servicio.estado_pago || 'pendiente',
      forma_pago: servicio.forma_pago || '',
      observaciones: servicio.observaciones || ''
    });
    setShowModal(true);
  };

  const handleMarcarPagado = async (id) => {
    const formaPago = prompt('Ingrese la forma de pago:');
    if (!formaPago) return;

    try {
      const data = await serviciosService.marcarPagado(id, { forma_pago: formaPago });
      if (data.success) {
        setSuccessMessage(data.message);
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al marcar como pagado:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleCancelar = async (id) => {
    const observaciones = prompt('Motivo de cancelación (opcional):');
    
    try {
      const data = await serviciosService.cancelar(id, { observaciones });
      if (data.success) {
        setSuccessMessage(data.message);
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al cancelar servicio:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este servicio?')) {
      return;
    }

    try {
      const data = await serviciosService.delete(id);
      if (data.success) {
        setSuccessMessage('Servicio eliminado exitosamente');
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: data.message || data.error });
      }
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const resetForm = () => {
    setFormData({
      tipo_servicio: '',
      fecha_servicio: '',
      hora_servicio: '',
      nombre_solicitante: '',
      telefono_solicitante: '',
      email_solicitante: '',
      descripcion: '',
      monto_soles: '',
      monto_dolares: '',
      estado_pago: 'pendiente',
      forma_pago: '',
      observaciones: ''
    });
    setEditingServicio(null);
    setErrors({});
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (filterType, value) => {
    if (filterType === 'tipo') {
      setSelectedTipo(value);
    } else if (filterType === 'estado') {
      setSelectedEstado(value);
    } else if (filterType === 'fecha_desde') {
      setFechaDesde(value);
    } else if (filterType === 'fecha_hasta') {
      setFechaHasta(value);
    }
    setCurrentPage(1);
  };

  const getEstadoStyle = (estado) => {
    const estadoObj = estadosPago.find(e => e.value === estado);
    return estadoObj ? estadoObj.color : 'bg-gray-100 text-gray-800';
  };

  const getEstadoLabel = (estado) => {
    const estadoObj = estadosPago.find(e => e.value === estado);
    return estadoObj ? estadoObj.label : estado;
  };

  const getTipoLabel = (tipo) => {
    const tipoObj = tiposServicio.find(t => t.value === tipo);
    return tipoObj ? tipoObj.label : tipo;
  };

  if (loading && servicios.length === 0) {
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
          Servicios Eclesiásticos
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestión de servicios religiosos y ceremonias
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
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Servicios</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Servicios Pagados</h3>
          <p className="text-2xl font-bold text-green-600">{stats.servicios_pagados || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Ingresos Soles</h3>
          <p className="text-2xl font-bold text-blue-600">S/ {stats.ingresos_soles || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Ingresos Dólares</h3>
          <p className="text-2xl font-bold text-purple-600">$ {stats.ingresos_dolares || 0}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <input
            type="text"
            placeholder="Buscar servicios..."
            value={searchTerm}
            onChange={handleSearch}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={selectedTipo}
            onChange={(e) => handleFilterChange('tipo', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los tipos</option>
            {tiposServicio.map(tipo => (
              <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
            ))}
          </select>
          <select
            value={selectedEstado}
            onChange={(e) => handleFilterChange('estado', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {estadosPago.map(estado => (
              <option key={estado.value} value={estado.value}>{estado.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => handleFilterChange('fecha_desde', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Desde"
          />
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Hasta"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Nuevo Servicio
          </button>
        </div>
      </div>

      {/* Tabla de servicios */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Comprobante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Tipo / Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Solicitante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Monto
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
              {servicios.map((servicio) => (
                <tr key={servicio.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {servicio.numero_comprobante}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {getTipoLabel(servicio.tipo_servicio)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(servicio.fecha_servicio).toLocaleDateString()}
                        {servicio.hora_servicio && ` - ${servicio.hora_servicio}`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {servicio.nombre_solicitante}
                      </div>
                      {servicio.telefono_solicitante && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {servicio.telefono_solicitante}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div>
                      {servicio.monto_soles && <div>S/ {servicio.monto_soles}</div>}
                      {servicio.monto_dolares && <div>$ {servicio.monto_dolares}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEstadoStyle(servicio.estado_pago)}`}>
                      {getEstadoLabel(servicio.estado_pago)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleEdit(servicio)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Editar
                      </button>
                      {servicio.estado_pago === 'pendiente' && (
                        <>
                          <button
                            onClick={() => handleMarcarPagado(servicio.id)}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Marcar Pagado
                          </button>
                          <button
                            onClick={() => handleCancelar(servicio.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      {servicio.estado_pago !== 'pagado' && (
                        <button
                          onClick={() => handleDelete(servicio.id)}
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

        {servicios.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || selectedTipo || selectedEstado || fechaDesde || fechaHasta ? 'No se encontraron servicios que coincidan con los filtros.' : 'No hay servicios registrados.'}
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

      {/* Modal de Nuevo/Editar Servicio */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tipo de Servicio */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Servicio *
                    </label>
                    <select
                      value={formData.tipo_servicio}
                      onChange={(e) => setFormData(prev => ({ ...prev, tipo_servicio: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                        errors.tipo_servicio ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">Seleccionar tipo</option>
                      {tiposServicio.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))}
                    </select>
                    {errors.tipo_servicio && (
                      <p className="mt-1 text-sm text-red-600">{errors.tipo_servicio}</p>
                    )}
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha del Servicio *
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_servicio}
                      onChange={(e) => setFormData(prev => ({ ...prev, fecha_servicio: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                        errors.fecha_servicio ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required
                    />
                    {errors.fecha_servicio && (
                      <p className="mt-1 text-sm text-red-600">{errors.fecha_servicio}</p>
                    )}
                  </div>

                  {/* Hora */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Hora del Servicio
                    </label>
                    <input
                      type="time"
                      value={formData.hora_servicio}
                      onChange={(e) => setFormData(prev => ({ ...prev, hora_servicio: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  {/* Nombre Solicitante */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nombre del Solicitante *
                    </label>
                    <input
                      type="text"
                      value={formData.nombre_solicitante}
                      onChange={(e) => setFormData(prev => ({ ...prev, nombre_solicitante: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                        errors.nombre_solicitante ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Nombre completo"
                      required
                    />
                    {errors.nombre_solicitante && (
                      <p className="mt-1 text-sm text-red-600">{errors.nombre_solicitante}</p>
                    )}
                  </div>

                  {/* Teléfono */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={formData.telefono_solicitante}
                      onChange={(e) => setFormData(prev => ({ ...prev, telefono_solicitante: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Número de teléfono"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email_solicitante}
                      onChange={(e) => setFormData(prev => ({ ...prev, email_solicitante: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Correo electrónico"
                    />
                  </div>

                  {/* Monto Soles */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto en Soles
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monto_soles}
                      onChange={(e) => setFormData(prev => ({ ...prev, monto_soles: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Monto Dólares */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto en Dólares
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monto_dolares}
                      onChange={(e) => setFormData(prev => ({ ...prev, monto_dolares: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={formData.descripcion}
                    onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Descripción del servicio"
                  />
                </div>

                {/* Estado de Pago y Forma de Pago */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Estado de Pago
                    </label>
                    <select
                      value={formData.estado_pago}
                      onChange={(e) => setFormData(prev => ({ ...prev, estado_pago: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      {estadosPago.map(estado => (
                        <option key={estado.value} value={estado.value}>{estado.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Forma de Pago
                    </label>
                    <select
                      value={formData.forma_pago}
                      onChange={(e) => setFormData(prev => ({ ...prev, forma_pago: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="">Seleccionar forma de pago</option>
                      {formasPago.map(forma => (
                        <option key={forma.value} value={forma.value}>{forma.label}</option>
                      ))}
                    </select>
                  </div>
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
                    {editingServicio ? 'Actualizar' : 'Crear'}
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

export default Servicios;

