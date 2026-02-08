// frontend/src/pages/Usuarios.jsx
/**
 * Gestión de usuarios basada en roles del sistema RBAC.
 * 
 * FIX: Usa hasPermission del AuthContext para ocultar botones según permisos granulares
 * - usuarios_leer → puede ver la lista
 * - usuarios_crear → puede crear nuevos usuarios (botón + Nuevo)
 * - usuarios_actualizar → puede editar usuarios (botones Editar, Activar/Desactivar)
 * - usuarios_eliminar → puede eliminar usuarios (botón Eliminar)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ← FIX: Usar hasPermission del AuthContext para verificar permisos granulares
  const { hasPermission } = useAuth();

  // Permisos granulares del usuario actual
  const canCreate = hasPermission('usuarios', 'crear');
  const canUpdate = hasPermission('usuarios', 'actualizar');
  const canDelete = hasPermission('usuarios', 'eliminar');
  const canModify = canCreate || canUpdate; // Puede ver el formulario

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol_id: '',
    activo: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, rolesRes] = await Promise.all([
        axios.get(`${API_URL}/usuarios`, { headers }),
        axios.get(`${API_URL}/roles`, { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      setUsuarios(usersRes.data.data || []);
      
      const rolesData = rolesRes.data.data || [];
      setRoles(rolesData);

      if (!formData.rol_id && rolesData.length > 0) {
        const defaultRol = rolesData.find(r => !r.es_admin) || rolesData[0];
        setFormData(prev => ({ ...prev, rol_id: defaultRol.id }));
      }

      setError(null);
    } catch (err) {
      setError('Error al cargar datos: ' + (err.response?.data?.error || err.message));
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRolNombre = (usuario) => {
    if (usuario.rol_nombre) return usuario.rol_nombre;
    const rol = roles.find(r => r.id === usuario.rol_id);
    return rol ? rol.nombre : (usuario.rol || 'Sin rol');
  };

  const handleEdit = (usuario) => {
    if (!canUpdate) return; // Doble protección
    setFormData({
      nombre: usuario.nombre,
      email: usuario.email,
      password: '',
      rol_id: usuario.rol_id || '',
      activo: !!usuario.activo,
    });
    setEditingId(usuario.id);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Verificar permiso antes de enviar
    if (editingId && !canUpdate) {
      setError('No tienes permiso para editar usuarios');
      return;
    }
    if (!editingId && !canCreate) {
      setError('No tienes permiso para crear usuarios');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (!formData.nombre.trim()) {
        setError('El nombre es obligatorio');
        return;
      }
      if (!formData.email.trim()) {
        setError('El email es obligatorio');
        return;
      }
      if (!formData.rol_id) {
        setError('Debe seleccionar un rol');
        return;
      }
      if (!editingId && (!formData.password || formData.password.length < 6)) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (editingId && formData.password && formData.password.length < 6) {
        setError('Si cambias la contraseña, debe tener al menos 6 caracteres');
        return;
      }

      const payload = {
        nombre: formData.nombre.trim(),
        email: formData.email.toLowerCase(),
        rol_id: parseInt(formData.rol_id),
        activo: formData.activo,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      if (editingId) {
        await axios.put(`${API_URL}/usuarios/${editingId}`, payload, { headers });
        setSuccess('Usuario actualizado exitosamente');
      } else {
        await axios.post(`${API_URL}/usuarios`, payload, { headers });
        setSuccess('Usuario creado exitosamente');
      }

      const defaultRol = roles.find(r => !r.es_admin) || roles[0];
      setFormData({
        nombre: '',
        email: '',
        password: '',
        rol_id: defaultRol?.id || '',
        activo: true,
      });
      setEditingId(null);
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError('Error al guardar usuario: ' + (err.response?.data?.error || err.message));
      console.error('Error:', err);
    }
  };

  const handleToggleStatus = async (usuario) => {
    if (!canUpdate) return; // Doble protección
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.patch(`${API_URL}/usuarios/${usuario.id}/toggle-status`, {}, { headers });
      setSuccess(`Usuario ${usuario.activo ? 'desactivado' : 'activado'} exitosamente`);
      await fetchData();
    } catch (err) {
      setError('Error al cambiar estado');
      console.error('Error:', err);
    }
  };

  const handleDelete = async (usuario) => {
    if (!canDelete) return; // Doble protección
    if (window.confirm(`¿Estás seguro de eliminar a ${usuario.nombre}? Esta acción no se puede deshacer.`)) {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.delete(`${API_URL}/usuarios/${usuario.id}`, { headers });
        setSuccess('Usuario eliminado exitosamente');
        await fetchData();
      } catch (err) {
        setError('Error al eliminar usuario');
        console.error('Error:', err);
      }
    }
  };

  const filteredUsuarios = usuarios.filter((u) =>
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Gestión de Usuarios
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Administra usuarios y asigna roles del sistema
          </p>
        </div>

        {/* Mensajes */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* Botón nuevo usuario + búsqueda */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          {/* ← FIX: Solo mostrar botón "Nuevo" si tiene permiso de crear */}
          {canCreate && (
            <button
              onClick={() => {
                const defaultRol = roles.find(r => !r.es_admin) || roles[0];
                setShowForm(true);
                setEditingId(null);
                setFormData({
                  nombre: '',
                  email: '',
                  password: '',
                  rol_id: defaultRol?.id || '',
                  activo: true,
                });
                setError(null);
                setSuccess(null);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              + Nuevo Usuario
            </button>
          )}
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Formulario - solo si tiene permiso de crear o actualizar */}
        {showForm && canModify && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contraseña {editingId && '(dejar en blanco para no cambiar)'}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    value={formData.password}
                    placeholder="min. 6 caracteres"
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rol
                  </label>
                  <select
                    value={formData.rol_id}
                    onChange={(e) => setFormData({ ...formData, rol_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Seleccionar rol --</option>
                    {roles.map((rol) => (
                      <option key={rol.id} value={rol.id}>
                        {rol.nombre}
                        {rol.es_admin ? ' (Admin)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Estado */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activo"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="activo" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Usuario activo
                </label>
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabla de usuarios */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Nombre</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Rol</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Estado</th>
                  {/* ← FIX: Solo mostrar columna Acciones si tiene algún permiso de modificación */}
                  {(canUpdate || canDelete) && (
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsuarios.length === 0 ? (
                  <tr>
                    <td colSpan={canUpdate || canDelete ? 5 : 4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No hay usuarios registrados
                    </td>
                  </tr>
                ) : (
                  filteredUsuarios.map((usuario) => (
                    <tr key={usuario.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                        {usuario.nombre}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {usuario.email}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                          {getRolNombre(usuario)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            usuario.activo
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}
                        >
                          {usuario.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {/* ← FIX: Botones condicionados por permiso granular */}
                      {(canUpdate || canDelete) && (
                        <td className="px-4 py-3 text-sm space-x-2">
                          {canUpdate && (
                            <button
                              onClick={() => handleEdit(usuario)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                            >
                              Editar
                            </button>
                          )}
                          {canUpdate && (
                            <button
                              onClick={() => handleToggleStatus(usuario)}
                              className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 font-medium"
                            >
                              {usuario.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(usuario)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                            >
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
