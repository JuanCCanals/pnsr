import React, { useEffect, useState } from 'react';
import api from '../services/api'; // tu instancia de Axios

/**
 * Campanias.jsx  (TailwindCSS)
 * CRUD de campañas anuales
 */
const Campanias = () => {
  // ─── State ─────────────────────────────────────────
  const [campanias, setCampanias] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({
    anio: new Date().getFullYear(),
    nombre: '',
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    estado: 'ACTIVA',
  });

  // ─── Fetch inicial ─────────────────────────────────
  const fetchCampanias = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/campanias');
      setCampanias(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Error cargando campañas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampanias();
  }, []);

  // ─── Modal helpers ─────────────────────────────────
  const openNewModal = () => {
    setEditingId(null);
    setFormData({
      anio: new Date().getFullYear(),
      nombre: '',
      descripcion: '',
      fecha_inicio: '',
      fecha_fin: '',
      estado: 'ACTIVA',
    });
    setShowModal(true);
  };

  const openEditModal = (camp) => {
    setEditingId(camp.id);
    setFormData({
      anio: camp.anio,
      nombre: camp.nombre,
      descripcion: camp.descripcion || '',
      fecha_inicio: camp.fecha_inicio || '',
      fecha_fin: camp.fecha_fin || '',
      estado: camp.estado,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ─── Crear / Editar ─────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/campanias/${editingId}`, formData);
      } else {
        await api.post('/campanias', formData);
      }
      setShowModal(false);
      fetchCampanias();
    } catch (err) {
      console.error(err);
      // Mostrar mensaje del backend si lo envía, o genérico
      const msg = err.response?.data?.message || 'Error guardando campaña';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Activar / Desactivar ────────────────────────────
  const toggleEstado = async (camp) => {
    setLoading(true);
    try {
      const nuevoEstado = camp.estado === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA';
      await api.put(`/campanias/${camp.id}`, { estado: nuevoEstado });
      fetchCampanias();
    } catch (err) {
      console.error(err);
      setError('No se pudo cambiar el estado');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Campañas</h2>

      <button
        onClick={openNewModal}
        className="px-4 py-2 bg-blue-600 text-white rounded mb-4 hover:bg-blue-700"
      >
        Nueva Campaña
      </button>

      {loading && <p className="text-gray-600">Cargando...</p>}
      {error   && <p className="text-red-500 mb-2">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border">Año</th>
              <th className="px-4 py-2 border">Nombre</th>
              <th className="px-4 py-2 border">Estado</th>
              <th className="px-4 py-2 border">Inicio</th>
              <th className="px-4 py-2 border">Fin</th>
              <th className="px-4 py-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {campanias.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border">{c.anio}</td>
                <td className="px-4 py-2 border">{c.nombre}</td>
                <td className="px-4 py-2 border">{c.estado}</td>
                <td className="px-4 py-2 border">{c.fecha_inicio || '-'}</td>
                <td className="px-4 py-2 border">{c.fecha_fin    || '-'}</td>
                <td className="px-4 py-2 border space-x-2">
                  <button
                    onClick={() => openEditModal(c)}
                    className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleEstado(c)}
                    className={`px-2 py-1 text-xs rounded text-white ${
                      c.estado === 'ACTIVA'
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {c.estado === 'ACTIVA' ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Editar Campaña' : 'Nueva Campaña'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Año</label>
                <input
                  type="number"
                  name="anio"
                  value={formData.anio}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Nombre</label>
                <input
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Descripción</label>
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium">Fecha Inicio</label>
                  <input
                    type="date"
                    name="fecha_inicio"
                    value={formData.fecha_inicio}
                    onChange={handleChange}
                    className="mt-1 w-full border rounded px-2 py-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium">Fecha Fin</label>
                  <input
                    type="date"
                    name="fecha_fin"
                    value={formData.fecha_fin}
                    onChange={handleChange}
                    className="mt-1 w-full border rounded px-2 py-1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  className="px-3 py-1 bg-gray-300 rounded"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campanias;
