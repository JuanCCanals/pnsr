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
  getPermisos:()      => api.get('/permisos').then(r => r.data),
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

// Servicio de Ventas (GESTIÓN)
export const ventasService = {
  getAll:     (params)          => api.get('/ventas', { params }).then(r => r.data),
  exportAll:  (params)          => api.get('/ventas/export', { params }).then(r => r.data),
  buscarCaja: (codigo)          => api.get(`/ventas/box/${encodeURIComponent(codigo)}`).then(r => r.data),
  registrar:  (payload)         => api.post('/ventas', payload).then(r => r.data),
  update:     (id, body)        => api.put(`/ventas/${id}`, body).then(r => r.data),
};

export const catalogosService = {
  getModalidades: () => api.get('/catalogos/modalidades').then(r => r.data),
  getPuntosVenta: () => api.get('/catalogos/puntos-venta').then(r => r.data),
};

export const serviciosService = {
  getAll: ()    => api.get('/servicios').then(res => res.data),
  getById: id  => api.get(`/servicios/${id}`).then(res => res.data),
  create: data => api.post('/servicios', data).then(res => res.data),
  update: (id,d)=>api.put(`/servicios/${id}`, d).then(res => res.data),
  delete: id   => api.delete(`/servicios/${id}`).then(res => res.data),
  getRENIEC: dni=> api.get(`/servicios/reniec/${dni}`).then(res => res.data),
};

// --- Cobros ---
export const cobrosService = {
  ensureCliente: (nombre, dni='') =>
    api.post('/cobros/ensure-cliente', { nombre, dni }).then(r => r.data),

  crear: (payload) =>
    api.post('/cobros', payload).then(r => r.data),

  getById: (id) =>
    api.get(`/cobros/${id}`).then(r => r.data),

  // Si quieres abrir el PDF del ticket (versión PDF),
  // puedes construir la URL absoluta con baseURL:
  openTicketPdf: (id, { tpl='familias', hideCliente=1 } = {}) => {
    const base = API_BASE_URL.replace(/\/api$/, ''); // http://localhost:3001
    const url = `${base}/api/cobros/${id}/ticket?tpl=${encodeURIComponent(tpl)}&hideCliente=${hideCliente}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};


// --- familiasService: agrega estos helpers ---
familiasService.getById = (id) =>
  api.get(`/familias/${id}`).then(r => r.data); // { success, data }

familiasService.getIntegrantes = (familiaId) =>
  api.get(`/familias/${familiaId}/integrantes`).then(r => r.data); // { success, data: [] }

familiasService.getLabelsByZona = (zona_id) =>
  api.get(`/familias/labels/bulk`, { params: { zona_id } }).then(r => r.data); // { success, data: [] }

// importar excel
familiasService.importExcel = (formData) =>
  api.post('/familias/import-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);

// crear / actualizar familia
familiasService.create = (payload) => api.post('/familias', payload).then(r => r.data);
familiasService.update = (id, payload) => api.put(`/familias/${id}`, payload).then(r => r.data);

// (por si faltan) etiquetas por zona / integrantes
familiasService.getLabelsByZona = (zona_id) =>
  api.get('/familias/labels/bulk', { params: { zona_id } }).then(r => r.data);
familiasService.getIntegrantes = (familiaId) =>
  api.get(`/familias/${familiaId}/integrantes`).then(r => r.data);

// --- Configuración del Sistema ---
export const configuracionService = {
  get: (clave) => api.get(`/configuracion/${clave}`).then(r => r.data),
  update: (clave, valor) => api.put(`/configuracion/${clave}`, { valor }).then(r => r.data),
  getAll: () => api.get('/configuracion').then(r => r.data),
};

// Exportar API base
export default api;
