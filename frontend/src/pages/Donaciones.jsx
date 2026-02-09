// frontend/src/pages/Donaciones.jsx
/**
 * Donaciones - Excedentes
 * CRUD de la tabla excedentes (id, venta_id, excedente, fecha)
 * Ahora venta_id se usa como "Código de Caja (opcional)".
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const Donaciones = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('donaciones', 'crear');
  const canUpdate = hasPermission('donaciones', 'actualizar');
  const canDelete = hasPermission('donaciones', 'eliminar');

  const [excedentes, setExcedentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    venta_id: '',
    excedente: '',
    fecha: '',
  });

  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  // Cargar lista inicial
  useEffect(() => {
    fetchExcedentes();
  }, []);

  const fetchExcedentes = async (filtros = {}) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const params = {};
      if (filtros.desde) params.desde = filtros.desde;
      if (filtros.hasta) params.hasta = filtros.hasta;

      const res = await axios.get(`${API_URL}/excedentes`, {
        headers,
        params,
      });

      setExcedentes(res.data.data || []);
    } catch (err) {
      console.error('Error cargando excedentes:', err);
      setError(
        'Error al cargar excedentes: ' +
          (err.response?.data?.error || err.message)
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      venta_id: '',
      excedente: '',
      fecha: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleNuevo = () => {
    setError(null);
    setSuccess(null);
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (item) => {
    setError(null);
    setSuccess(null);
    setFormData({
      venta_id:
        item.venta_id !== null && item.venta_id !== undefined
          ? item.venta_id.toString()
          : '',
      excedente: item.excedente?.toString() || '',
      // fecha opcional, normalmente la maneja el servidor
      fecha: item.fecha ? item.fecha.substring(0, 19).replace('T', ' ') : '',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (item) => {
    const labelCaja =
      item.venta_id !== null && item.venta_id !== undefined
        ? item.venta_id
        : 'sin caja asociada';

    if (
      !window.confirm(
        `¿Seguro que deseas eliminar el excedente #${item.id} (código de caja: ${labelCaja})?`
      )
    ) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API_URL}/excedentes/${item.id}`, { headers });

      setSuccess('Excedente eliminado correctamente');
      await fetchExcedentes({ desde: filtroDesde, hasta: filtroHasta });
    } catch (err) {
      console.error('Error al eliminar excedente:', err);
      setError(
        'Error al eliminar excedente: ' +
          (err.response?.data?.error || err.message)
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError(null);
      setSuccess(null);

      if (!formData.excedente) {
        setError('Debe ingresar el valor del excedente');
        return;
      }

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const payload = {
        excedente: Number(formData.excedente),
      };

      // Sólo enviamos venta_id si el usuario lo llenó (Código de Caja opcional)
      if (
        formData.venta_id !== undefined &&
        formData.venta_id !== null &&
        formData.venta_id.toString().trim() !== ''
      ) {
        payload.venta_id = Number(formData.venta_id);
      }

      // Sólo mandamos fecha si el usuario la llenó
      if (formData.fecha && formData.fecha.trim() !== '') {
        payload.fecha = formData.fecha.trim();
      }

      if (editingId) {
        await axios.put(`${API_URL}/excedentes/${editingId}`, payload, {
          headers,
        });
        setSuccess('Excedente actualizado correctamente');
      } else {
        await axios.post(`${API_URL}/excedentes`, payload, { headers });
        setSuccess('Excedente registrado correctamente');
      }

      resetForm();
      await fetchExcedentes({ desde: filtroDesde, hasta: filtroHasta });
    } catch (err) {
      console.error('Error al guardar excedente:', err);
      const msg = err.response?.data?.message || err.response?.data?.error;
      setError('Error al guardar excedente: ' + (msg || err.message));
    }
  };

  const handleFiltrar = (e) => {
    e.preventDefault();
    fetchExcedentes({ desde: filtroDesde, hasta: filtroHasta });
  };

  const handleLimpiarFiltros = () => {
    setFiltroDesde('');
    setFiltroHasta('');
    fetchExcedentes();
  };

  if (loading && excedentes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Cargando donaciones - excedentes...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Donaciones - Excedentes
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Gestión de los excedentes registrados en las ventas de cajas
          (donaciones adicionales) y excedentes generales de campaña.
        </p>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
          {success}
        </div>
      )}

      {/* Filtros + botón nuevo */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <form
            onSubmit={handleFiltrar}
            className="flex flex-col md:flex-row gap-4 flex-1"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Desde (fecha)
              </label>
              <input
                type="date"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hasta (fecha)
              </label>
              <input
                type="date"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-2 md:mt-0">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={handleLimpiarFiltros}
                className="bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Limpiar
              </button>
            </div>
          </form>

          <div>
            {canCreate && <button
              onClick={handleNuevo}
              className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duración-200"
            >
              + Registrar Excedente
            </button>}
          </div>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (canCreate || canUpdate) && (
        <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            {editingId ? 'Editar Excedente' : 'Nuevo Excedente'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Código de Caja (opcional)
                </label>
                <input
                  type="number"
                  value={formData.venta_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      venta_id: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 101"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Puedes dejarlo en blanco si el excedente no está asociado a
                  una caja específica.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Excedente (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.excedente}
                  onChange={(e) =>
                    setFormData({ ...formData, excedente: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 10.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={
                    formData.fecha
                      ? formData.fecha.substring(0, 16).replace(' ', 'T')
                      : ''
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fecha: e.target.value
                        ? e.target.value.replace('T', ' ') + ':00'
                        : '',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Si la dejas en blanco, se usará la fecha/hora actual del
                  servidor.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de excedentes */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Listado de Excedentes
        </h2>

        {excedentes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-300">
            No hay excedentes registrados para los filtros seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    ID
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    Código de Caja
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    Excedente (S/)
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    Fecha
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {excedentes.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {item.id}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                      {item.venta_id !== null && item.venta_id !== undefined
                        ? item.venta_id
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                      S/ {Number(item.excedente).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                      {item.fecha
                        ? new Date(item.fecha).toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      {canUpdate && <button
                        onClick={() => handleEdit(item)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                      >
                        Editar
                      </button>}
                      {canDelete && <button
                        onClick={() => handleDelete(item)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                      >
                        Eliminar
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Donaciones;
