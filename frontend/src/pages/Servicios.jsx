// /src/pages/Servicios.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/* ============== Helpers HTTP (fetch + JWT) ============== */
async function httpGet(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
async function httpJSON(url, method, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return res.json();
}

/* ============== Endpoints del catálogo ============== */
async function listarTipos() { return httpGet('/api/tipos-servicio'); }
async function crearTipo(data) { return httpJSON('/api/tipos-servicio', 'POST', data); }
async function actualizarTipo(id, data) { return httpJSON(`/api/tipos-servicio/${id}`, 'PUT', data); }
async function eliminarTipo(id) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/tipos-servicio/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

/* ========================= Componente ========================= */
export default function Servicios() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('servicios', 'crear');
  const canUpdate = hasPermission('servicios', 'actualizar');
  const canDelete = hasPermission('servicios', 'eliminar');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    costo_sugerido: '',
    estado: 'activo'
  });
  const [search, setSearch] = useState('');

  const estados = [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' }
  ];

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      setLoading(true);
      const r = await listarTipos();
      if (r?.success) setItems(r.data || []);
      else setMsg({ type: 'error', text: r?.error || 'No se pudo cargar el catálogo' });
    } catch {
      setMsg({ type: 'error', text: 'Error de conexión' });
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ nombre: '', descripcion: '', costo_sugerido: '', estado: 'activo' });
    setShowModal(true);
  };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      nombre: it.nombre || '',
      descripcion: it.descripcion || '',
      costo_sugerido: it.costo_sugerido ?? '',
      estado: it.estado || 'activo'
    });
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    try {
      const payload = {
        nombre: (form.nombre || '').trim(),
        descripcion: (form.descripcion || '').trim() || null,
        costo_sugerido: form.costo_sugerido === '' ? null : Number(form.costo_sugerido),
        estado: form.estado || 'activo'
      };
      const r = editing
        ? await actualizarTipo(editing.id, payload)
        : await crearTipo(payload);

      if (r?.success) {
        setMsg({ type: 'success', text: editing ? 'Servicio actualizado' : 'Servicio creado' });
        setShowModal(false);
        setEditing(null);
        await load();
      } else {
        setMsg({ type: 'error', text: r?.error || 'No se pudo guardar' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de conexión' });
    }
  };

  const removeItem = async (id) => {
    if (!confirm('¿Eliminar este servicio del catálogo?')) return;
    try {
      const r = await eliminarTipo(id);
      if (r?.success) {
        setMsg({ type: 'success', text: 'Eliminado' });
        await load();
      } else {
        setMsg({ type: 'error', text: r?.error || 'No se pudo eliminar' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de conexión' });
    }
  };

  const filtered = items.filter(it =>
    (it.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    (it.descripcion || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Servicios (Catálogo)</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona los servicios eclesiásticos ofrecidos por la Parroquia (bautizo, matrimonio, etc.).
        </p>
      </div>

      {/* Mensajes */}
      {msg.text && (
        <div
          className={`mb-4 p-4 rounded border ${
            msg.type === 'success'
              ? 'bg-green-100 border-green-300 text-green-800'
              : 'bg-red-100 border-red-300 text-red-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Card principal */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between border-b dark:border-gray-700">
          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
              className="w-full md:w-80 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            {canCreate && <button
              onClick={openNew}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Nuevo
            </button>}
            <button
              onClick={load}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg"
            >
              Refrescar
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Costo sugerido</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {!loading && filtered.map(it => (
                <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{it.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{it.descripcion || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {it.costo_sugerido != null ? `S/ ${Number(it.costo_sugerido).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        it.estado === 'activo'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {it.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {canUpdate && <button
                      onClick={() => openEdit(it)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3"
                    >
                      Editar
                    </button>}
                    {canDelete && <button
                      onClick={() => removeItem(it.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Eliminar
                    </button>}
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    {items.length === 0 ? 'No hay servicios en el catálogo.' : 'Sin resultados para el filtro.'}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    Cargando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-xl w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editing ? 'Editar servicio' : 'Nuevo servicio'}
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

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre *</label>
                  <input
                    value={form.nombre}
                    onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Costo sugerido (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.costo_sugerido}
                    onChange={(e) => setForm(f => ({ ...f, costo_sugerido: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Déjalo vacío si no aplica (se guardará como nulo).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={(e) => setForm(f => ({ ...f, estado: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    {estados.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {editing ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
