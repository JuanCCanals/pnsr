import React, { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Modalidades.jsx
 * CRUD de modalidades por campaña.
 * - Permite seleccionar campaña y ver/modificar sus modalidades.
 * - Estilo: TailwindCSS.
 */
const Modalidades = () => {
  // State
  const [campanias, setCampanias] = useState([]);
  const [selectedCampania, setSelectedCampania] = useState('');
  const [modalidades, setModalidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ campania_id: '', nombre: '', costo: '', moneda: 'PEN', estado: 1 });

  // Fetch campañas para el filtro
  const fetchCampanias = async () => {
    try {
      const { data } = await api.get('/campanias');
      setCampanias(data);
      if (data.length) setSelectedCampania(data[0].id);
    } catch (err) {
      console.error(err);
      setError('Error cargando campañas');
    }
  };

  // Fetch modalidades según campaña seleccionada
  const fetchModalidades = async (campaniaId) => {
    setLoading(true);
    try {
      const { data } = await api.get('/modalidades', { params: { campania_id: campaniaId } });
      setModalidades(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Error cargando modalidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampanias();
  }, []);

  useEffect(() => {
    if (selectedCampania) fetchModalidades(selectedCampania);
  }, [selectedCampania]);

  // Handlers
  const handleCampaniaChange = (e) => {
    setSelectedCampania(e.target.value);
  };

  const openNewModal = () => {
    setEditingId(null);
    setFormData({ campania_id: selectedCampania, nombre: '', costo: '', moneda: 'PEN', estado: 1 });
    setShowModal(true);
  };

  const openEditModal = (modalidad) => {
    setEditingId(modalidad.id);
    setFormData({
      campania_id: modalidad.campania_id,
      nombre: modalidad.nombre,
      costo: modalidad.costo,
      moneda: modalidad.moneda,
      estado: modalidad.estado,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/modalidades/${editingId}`, formData);
      } else {
        await api.post('/modalidades', formData);
      }
      setShowModal(false);
      fetchModalidades(selectedCampania);
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || 'Error guardando modalidad';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Modalidades de Campaña</h2>

      {/* Filtro de campaña */}
      <div className="mb-4 flex items-center gap-4">
        <label className="font-medium">Campaña:</label>
        <select
          value={selectedCampania}
          onChange={handleCampaniaChange}
          className="border rounded px-2 py-1"
        >
          {campanias.map(c => (
            <option key={c.id} value={c.id}>{c.anio} - {c.nombre}</option>
          ))}
        </select>
        <button
          onClick={openNewModal}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Nueva Modalidad
        </button>
      </div>

      {loading && <p className="text-gray-600">Cargando...</p>}
      {error   && <p className="text-red-500 mb-2">{error}</p>}

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border">Nombre</th>
              <th className="px-4 py-2 border">Costo</th>
              <th className="px-4 py-2 border">Moneda</th>
              <th className="px-4 py-2 border">Estado</th>
              <th className="px-4 py-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {modalidades.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border">{m.nombre}</td>
                <td className="px-4 py-2 border">{m.costo}</td>
                <td className="px-4 py-2 border">{m.moneda}</td>
                <td className="px-4 py-2 border">{m.estado ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-2 border">
                  <button
                    onClick={() => openEditModal(m)}
                    className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal CRUD */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white w-full max-w-lg p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Editar Modalidad' : 'Nueva Modalidad'}
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium">Costo</label>
                  <input
                    type="number"
                    step="0.01"
                    name="costo"
                    value={formData.costo}
                    onChange={handleChange}
                    className="mt-1 w-full border rounded px-2 py-1"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium">Moneda</label>
                  <input
                    name="moneda"
                    value={formData.moneda}
                    onChange={handleChange}
                    className="mt-1 w-full border rounded px-2 py-1"
                    required
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

export default Modalidades;
