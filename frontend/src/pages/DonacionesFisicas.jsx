// frontend/src/pages/DonacionesFisicas.jsx
/**
 * Donaciones de Bienes
 * CRUD de donaciones físicas: ropa, alimentos, artículos de primera necesidad, etc.
 * Tabla: donaciones_fisicas
 */
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const CATEGORIAS = [
  { value: 'alimentos',               label: 'Alimentos' },
  { value: 'ropa',                     label: 'Ropa' },
  { value: 'articulos_hogar',          label: 'Artículos del hogar' },
  { value: 'medicinas',                label: 'Medicinas' },
  { value: 'utiles_escolares',         label: 'Útiles escolares' },
  { value: 'dinero_efectivo',          label: 'Dinero en efectivo' },
  { value: 'otros',                    label: 'Otros' },
];

const ESTADOS = [
  { value: 'recibido',    label: 'Recibido',    color: 'bg-blue-100 text-blue-800' },
  { value: 'en_almacen',  label: 'En almacén',  color: 'bg-yellow-100 text-yellow-800' },
  { value: 'distribuido', label: 'Distribuido',  color: 'bg-green-100 text-green-800' },
];

const DonacionesFisicas = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('donaciones_fisicas', 'crear');
  const canUpdate = hasPermission('donaciones_fisicas', 'actualizar');
  const canDelete = hasPermission('donaciones_fisicas', 'eliminar');

  // State
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);
  const [stats, setStats]         = useState(null);

  // Paginación
  const [page, setPage]           = useState(1);
  const limit                     = 20;
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasPrev: false, hasNext: false });

  // Filtros
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fechaDesde, setFechaDesde]   = useState('');
  const [fechaHasta, setFechaHasta]   = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData]   = useState({
    donante_nombre: '',
    donante_telefono: '',
    donante_dni: '',
    categoria: 'otros',
    descripcion: '',
    cantidad: 1,
    unidad: 'unidades',
    fecha_donacion: new Date().toISOString().slice(0, 10),
    destino: '',
    observaciones: '',
    estado: 'recibido',
  });

  // ─── Fetch ──────────────────────────────────────────
  const fetchRows = async (goToPage = page) => {
    setLoading(true);
    try {
      const params = {
        page: goToPage, limit,
        search: search || undefined,
        categoria: catFilter || undefined,
        estado: estadoFilter || undefined,
        desde: fechaDesde || undefined,
        hasta: fechaHasta || undefined,
      };
      const { data } = await api.get('/donaciones-fisicas', { params });
      if (data.success) {
        setRows(data.data || []);
        setPagination(data.pagination || { total: 0, totalPages: 1, hasPrev: false, hasNext: false });
        setPage(goToPage);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Error cargando donaciones');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/donaciones-fisicas/stats');
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRows(1);
    fetchStats();
  }, []);

  useEffect(() => { fetchRows(1); }, [search, catFilter, estadoFilter, fechaDesde, fechaHasta]);

  // ─── Modal helpers ──────────────────────────────────
  const resetForm = () => {
    setFormData({
      donante_nombre: '', donante_telefono: '', donante_dni: '',
      categoria: 'otros', descripcion: '', cantidad: 1, unidad: 'unidades',
      fecha_donacion: new Date().toISOString().slice(0, 10),
      destino: '', observaciones: '', estado: 'recibido',
    });
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      donante_nombre:   item.donante_nombre || '',
      donante_telefono: item.donante_telefono || '',
      donante_dni:      item.donante_dni || '',
      categoria:        item.categoria || 'otros',
      descripcion:      item.descripcion || '',
      cantidad:         item.cantidad ?? 1,
      unidad:           item.unidad || 'unidades',
      fecha_donacion:   item.fecha_donacion ? item.fecha_donacion.substring(0, 10) : '',
      destino:          item.destino || '',
      observaciones:    item.observaciones || '',
      estado:           item.estado || 'recibido',
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ─── CRUD ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await api.put(`/donaciones-fisicas/${editingId}`, formData);
        setSuccess('Donación actualizada correctamente');
      } else {
        await api.post('/donaciones-fisicas', formData);
        setSuccess('Donación registrada correctamente');
      }
      setShowModal(false);
      resetForm();
      fetchRows();
      fetchStats();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.error || 'Error guardando donación';
      setError(msg);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`¿Eliminar la donación de "${item.donante_nombre}"?`)) return;
    try {
      await api.delete(`/donaciones-fisicas/${item.id}`);
      setSuccess('Donación eliminada');
      fetchRows();
      fetchStats();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Error al eliminar');
    }
  };

  // helpers
  const getCatLabel  = (val) => CATEGORIAS.find(c => c.value === val)?.label || val;
  const getEstado    = (val) => ESTADOS.find(e => e.value === val) || ESTADOS[0];

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Donaciones</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Registro de donaciones de bienes: ropa, alimentos, artículos de primera necesidad, etc.
            </p>
          </div>
          {canCreate && (
            <button
              onClick={openNew}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              + Nueva Donación
            </button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-center">
              <div className="text-sm text-gray-500">Total</div>
              <div className="text-xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
              <div className="text-sm text-blue-600">Recibidos</div>
              <div className="text-xl font-bold text-blue-800">{stats.recibidos}</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-center">
              <div className="text-sm text-yellow-600">En almacén</div>
              <div className="text-xl font-bold text-yellow-800">{stats.en_almacen}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
              <div className="text-sm text-green-600">Distribuidos</div>
              <div className="text-xl font-bold text-green-800">{stats.distribuidos}</div>
            </div>
          </div>
        )}
      </div>

      {/* Mensajes */}
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
      {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{success}</div>}

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar donante o descripción…"
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-600">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Donante</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Categoría</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Descripción</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Cantidad</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Destino</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-300">Estado</th>
                {(canUpdate || canDelete) && (
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-300">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Cargando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay donaciones registradas</td></tr>
              )}
              {!loading && rows.map(item => {
                const est = getEstado(item.estado);
                return (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.fecha_donacion ? new Date(item.fecha_donacion).toLocaleDateString('es-PE') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.donante_nombre}</div>
                      {item.donante_telefono && <div className="text-xs text-gray-500">{item.donante_telefono}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{getCatLabel(item.categoria)}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{item.descripcion}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{item.cantidad} {item.unidad}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{item.destino || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${est.color}`}>{est.label}</span>
                    </td>
                    {(canUpdate || canDelete) && (
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                        {canUpdate && (
                          <button onClick={() => openEdit(item)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400">
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(item)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400">
                            Eliminar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-600">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {pagination.total > 0
              ? <>Mostrando {(page - 1) * limit + 1} – {Math.min(page * limit, pagination.total)} de {pagination.total}</>
              : '—'}
          </div>
          <div className="flex gap-2">
            <button disabled={!pagination.hasPrev} onClick={() => fetchRows(page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
            <span className="px-3 py-1 rounded bg-blue-600 text-white">{page}</span>
            <button disabled={!pagination.hasNext} onClick={() => fetchRows(page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      </div>

      {/* Modal CRUD */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingId ? 'Editar Donación' : 'Nueva Donación'}
                </h2>
                <button onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl">&times;</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Donante */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nombre del donante *</label>
                    <input name="donante_nombre" value={formData.donante_nombre} onChange={handleChange} required
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Teléfono</label>
                    <input name="donante_telefono" value={formData.donante_telefono} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">DNI</label>
                    <input name="donante_dni" value={formData.donante_dni} onChange={handleChange} maxLength={15}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                {/* Donación */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Categoría *</label>
                    <select name="categoria" value={formData.categoria} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Cantidad</label>
                    <input type="number" step="0.01" min="0" name="cantidad" value={formData.cantidad} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unidad</label>
                    <input name="unidad" value={formData.unidad} onChange={handleChange} placeholder="unidades, kg, cajas…"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Descripción *</label>
                  <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} required rows={2}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Detalle de lo donado: 10 bolsas de arroz, 5 frazadas, etc." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Fecha de donación *</label>
                    <input type="date" name="fecha_donacion" value={formData.fecha_donacion} onChange={handleChange} required
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Estado</label>
                    <select name="estado" value={formData.estado} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Destino</label>
                    <input name="destino" value={formData.destino} onChange={handleChange}
                      placeholder="Familia, zona, evento…"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Observaciones</label>
                  <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows={2}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">Cancelar</button>
                  <button type="submit"
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                    {editingId ? 'Actualizar' : 'Registrar'}
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

export default DonacionesFisicas;
