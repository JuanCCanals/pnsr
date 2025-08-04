import axios from 'axios';

// Ajustamos el baseURL para incluir /api de forma global
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Interceptor para agregar token de autenticación y manejar Content-Type
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Si el cuerpo es FormData, dejar que Axios establezca multipart boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para manejar respuestas y errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Servicios de autenticación (ya no llevan /api en la ruta)
export const authService = {
  login:    (email, password) => api.post('/auth/login',    { email, password }).then(r => r.data),
  register: (userData)        => api.post('/auth/register', userData).then(r => r.data),
  verify:   ()                => api.get('/auth/verify').then(r => r.data),
  getProfile:()               => api.get('/auth/profile').then(r => r.data),
  updateProfile:(data)        => api.put('/auth/profile', data).then(r => r.data),
  changePassword:(data)       => api.post('/auth/change-password', data).then(r => r.data),
  logout:   ()                => api.post('/auth/logout').then(r => {localStorage.removeItem('token'); localStorage.removeItem('user'); return r.data;}),
};

// Servicios de usuarios
export const usuarioService = {
  getAll:    (params) => api.get('/usuarios', { params }).then(r => r.data),
  getById:   (id)     => api.get(`/usuarios/${id}`).then(r => r.data),
  create:    (u)      => api.post('/usuarios', u).then(r => r.data),
  update:    (id, u)  => api.put(`/usuarios/${id}`, u).then(r => r.data),
  delete:    (id)     => api.delete(`/usuarios/${id}`).then(r => r.data),
  toggleStatus:(id)   => api.patch(`/usuarios/${id}/toggle-status`).then(r => r.data),
  getStats:  ()       => api.get('/usuarios/stats').then(r => r.data),
  getPermisos:()      => api.get('/usuarios/permisos').then(r => r.data),
  getUserPermisos:(id)=> api.get(`/usuarios/${id}/permisos`).then(r => r.data),
};

// Servicios de zonas
export const zonasService = {
  getAll:    (params) => api.get('/zonas', { params }).then(r => r.data),
  getById:   (id)     => api.get(`/zonas/${id}`).then(r => r.data),
  create:    (z)      => api.post('/zonas', z).then(r => r.data),
  update:    (id, z)  => api.put(`/zonas/${id}`, z).then(r => r.data),
  delete:    (id)     => api.delete(`/zonas/${id}`).then(r => r.data),
  toggleStatus:(id)   => api.patch(`/zonas/${id}/toggle-status`).then(r => r.data),
  getStats:  ()       => api.get('/zonas/stats').then(r => r.data),
};

// Servicios de familias
export const familiasService = {
  getAll:    (params) => api.get('/familias', { params }).then(r => r.data),
  getById:   (id)     => api.get(`/familias/${id}`).then(r => r.data),
  create:    (f)      => api.post('/familias', f).then(r => r.data),
  update:    (id, f)  => api.put(`/familias/${id}`, f).then(r => r.data),
  delete:    (id)     => api.delete(`/familias/${id}`).then(r => r.data),
  toggleStatus:(id)   => api.patch(`/familias/${id}/toggle-status`).then(r => r.data),
  getStats:  ()       => api.get('/familias/stats').then(r => r.data),
  importExcel:(formData)=>api.post('/familias/import-excel', formData).then(r=>r.data),
  getIntegrantes:(id) =>api.get(`/familias/${id}/integrantes`).then(r=>r.data),
  addIntegrante:(id, d)=>api.post(`/familias/${id}/integrantes`, d).then(r=>r.data),
};

// Servicio de Ventas
export const ventasService = {
  // Busca una caja por código único
  buscarCaja: (codigo) =>
    api.get(`/ventas/box/${codigo}`)
       .then(res => res.data),

  // Registra la venta (asigna la caja)
  registrar: (payload) =>
    api.post('/ventas', payload)
       .then(res => res.data),
};

export const serviciosService = {
  getAll: ()    => api.get('/servicios').then(res => res.data),
  getById: id  => api.get(`/servicios/${id}`).then(res => res.data),
  create: data => api.post('/servicios', data).then(res => res.data),
  update: (id,d)=>api.put(`/servicios/${id}`, d).then(res => res.data),
  delete: id   => api.delete(`/servicios/${id}`).then(res => res.data),
  getRENIEC: dni=> api.get(`/servicios/reniec/${dni}`).then(res => res.data),
};

// Exportar API base
export default api;
