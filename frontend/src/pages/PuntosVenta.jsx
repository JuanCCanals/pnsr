import React, { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * PuntosVenta.jsx
 * CRUD de puntos de venta (PARROQUIA / INSTITUCION)
 * Backend: /api/puntos-venta
 * Asigna usuario responsable (dropdown de usuarios)
 * Estilo: TailwindCSS
 */
const PuntosVenta = () => {
  // ─── State ─────────────────────────────────
  const [pvs, setPvs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal state
  const [showModal, setShowModal]     = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [formData, setFormData]       = useState({
    nombre: '',
    tipo: 'PARROQUIA',
    direccion: '',
    usuario_responsable_id: '',
    estado: 1,
  });

  // ─── Fetch data ───────────────────────────────
  const fetchPvs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/puntos-venta');
      setPvs(Array.isArray(data) ? data : (data.data || []));
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Error cargando puntos de venta');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const res = await api.get('/usuarios');
      // Asegurar que la respuesta sea un array
      const usuariosData = Array.isArray(res.data) ? res.data : (res.data.usuarios || res.data.data || []);
      setUsuarios(usuariosData);
    } catch (err) {
      console.error(err);
      // no es crítico
    }
  };

  useEffect(() => {
    fetchPvs();
    fetchUsuarios();
  }, []);

  // ─── Handlers ─────────────────────────────────
  const openNewModal = () => {
    setEditingId(null);
    setFormData({ nombre: '', tipo: 'PARROQUIA', direccion: '', usuario_responsable_id: '', estado: 1 });
    setShowModal(true);
  };

  const openEditModal = (pv) => {
    setEditingId(pv.id);
    setFormData({
      nombre: pv.nombre,
      tipo: pv.tipo,
      direccion: pv.direccion || '',
      usuario_responsable_id: pv.usuario_responsable_id || '',
      estado: pv.estado,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/puntos-venta/${editingId}`, formData);
      } else {
        await api.post('/puntos-venta', formData);
      }
      setShowModal(false);
      fetchPvs();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || 'Error guardando punto de venta';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleEstado = async (pv) => {
    setLoading(true);
    try {
      const nuevoEstado = pv.estado === 1 ? 0 : 1;
      await api.put(`/puntos-venta/${pv.id}`, { ...pv, estado: nuevoEstado });
      fetchPvs();
    } catch (err) {
      console.error(err);
      setError('No se pudo cambiar el estado');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Puntos de Venta</h2>

      <button
        onClick={openNewModal}
        className="px-4 py-2 bg-green-600 text-white rounded mb-4 hover:bg-green-700"
      >
        Nuevo Punto de Venta
      </button>

      {loading && <p className="text-gray-600">Cargando...</p>}
      {error   && <p className="text-red-500 mb-2">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border">Nombre</th>
              <th className="px-4 py-2 border">Tipo</th>
              <th className="px-4 py-2 border">Dirección</th>
              <th className="px-4 py-2 border">Responsable</th>
              <th className="px-4 py-2 border">Estado</th>
              <th className="px-4 py-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pvs.map(pv => (
              <tr key={pv.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border">{pv.nombre}</td>
                <td className="px-4 py-2 border">{pv.tipo}</td>
                <td className="px-4 py-2 border">{pv.direccion}</td>
                <td className="px-4 py-2 border">{pv.responsable || '-'}</td>
                <td className="px-4 py-2 border">{pv.estado === 1 ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-2 border space-x-2">
                  <button
                    onClick={() => openEditModal(pv)}
                    className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleEstado(pv)}
                    className={`px-2 py-1 text-xs rounded text-white ${
                      pv.estado === 1 ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
                    `}
                  >
                    {pv.estado === 1 ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white w-full max-w-lg p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Editar Punto de Venta' : 'Nuevo Punto de Venta'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="block text-sm font-medium">Tipo</label>
                <select
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  required
                >
                  <option value="PARROQUIA">Parroquia</option>
                  <option value="INSTITUCION">Institución</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Dirección</label>
                <textarea
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Responsable (Usuario)</label>
                <select
                  name="usuario_responsable_id"
                  value={formData.usuario_responsable_id}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded px-2 py-1"
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
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

export default PuntosVenta;
