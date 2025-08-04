import axios from 'axios';

// Configuración base de Axios
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token de autenticación
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar respuestas y errores
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Servicios de autenticación
export const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  verify: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (userData) => {
    const response = await api.put('/auth/profile', userData);
    return response.data;
  },

  changePassword: async (passwordData) => {
    const response = await api.post('/auth/change-password', passwordData);
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return response.data;
  },
};

// Servicios de zonas
export const zonaService = {
  getAll: async (includeStats = false) => {
    const response = await api.get(`/zonas?includeStats=${includeStats}`);
    return response.data;
  },

  getById: async (id, includeStats = false) => {
    const response = await api.get(`/zonas/${id}?includeStats=${includeStats}`);
    return response.data;
  },

  getPaginated: async (params = {}) => {
    const response = await api.get('/zonas/paginated', { params });
    return response.data;
  },

  create: async (zonaData) => {
    const response = await api.post('/zonas', zonaData);
    return response.data;
  },

  update: async (id, zonaData) => {
    const response = await api.put(`/zonas/${id}`, zonaData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/zonas/${id}`);
    return response.data;
  },

  toggleStatus: async (id) => {
    const response = await api.patch(`/zonas/${id}/toggle-status`);
    return response.data;
  },
};

// Servicios de familias
export const familiaService = {
  getAll: async () => {
    const response = await api.get('/familias');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/familias/${id}`);
    return response.data;
  },

  create: async (familiaData) => {
    const response = await api.post('/familias', familiaData);
    return response.data;
  },

  update: async (id, familiaData) => {
    const response = await api.put(`/familias/${id}`, familiaData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/familias/${id}`);
    return response.data;
  },

  search: async (searchTerm) => {
    const response = await api.get(`/familias/search?q=${encodeURIComponent(searchTerm)}`);
    return response.data;
  },

  getByZone: async (zonaId) => {
    const response = await api.get(`/familias/zona/${zonaId}`);
    return response.data;
  },
};

// Servicios de benefactores
export const benefactorService = {
  getAll: async (includeStats = false) => {
    const response = await api.get(`/benefactores?includeStats=${includeStats}`);
    return response.data;
  },

  getById: async (id, includeStats = false) => {
    const response = await api.get(`/benefactores/${id}?includeStats=${includeStats}`);
    return response.data;
  },

  create: async (benefactorData) => {
    const response = await api.post('/benefactores', benefactorData);
    return response.data;
  },

  update: async (id, benefactorData) => {
    const response = await api.put(`/benefactores/${id}`, benefactorData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/benefactores/${id}`);
    return response.data;
  },

  search: async (searchTerm) => {
    const response = await api.get(`/benefactores/search?q=${encodeURIComponent(searchTerm)}`);
    return response.data;
  },

  getCajas: async (benefactorId) => {
    const response = await api.get(`/benefactores/${benefactorId}/cajas`);
    return response.data;
  },
};

// Servicios de cajas
export const cajaService = {
  getAll: async (filters = {}) => {
    const response = await api.get('/cajas', { params: filters });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/cajas/${id}`);
    return response.data;
  },

  create: async (cajaData) => {
    const response = await api.post('/cajas', cajaData);
    return response.data;
  },

  update: async (id, cajaData) => {
    const response = await api.put(`/cajas/${id}`, cajaData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/cajas/${id}`);
    return response.data;
  },

  assignToBenefactor: async (cajaId, benefactorId) => {
    const response = await api.post(`/cajas/${cajaId}/assign`, { benefactorId });
    return response.data;
  },

  markAsDelivered: async (cajaId) => {
    const response = await api.post(`/cajas/${cajaId}/deliver`);
    return response.data;
  },

  markAsReturned: async (cajaId, observaciones) => {
    const response = await api.post(`/cajas/${cajaId}/return`, { observaciones });
    return response.data;
  },

  release: async (cajaId) => {
    const response = await api.post(`/cajas/${cajaId}/release`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/cajas/stats');
    return response.data;
  },

  search: async (searchTerm) => {
    const response = await api.get(`/cajas/search?q=${encodeURIComponent(searchTerm)}`);
    return response.data;
  },
};

// Servicios de usuarios (CORREGIDO)
export const usuarioService = {
  getAll: async () => {
    const response = await api.get('/usuarios');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/usuarios/${id}`);
    return response.data;
  },

  create: async (userData) => {
    const response = await api.post('/usuarios', userData);
    return response.data;
  },

  update: async (id, userData) => {
    const response = await api.put(`/usuarios/${id}`, userData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/usuarios/${id}`);
    return response.data;
  },

  toggleStatus: async (id) => {
    const response = await api.patch(`/usuarios/${id}/toggle-status`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/usuarios/stats');
    return response.data;
  },

  // NUEVO: Obtener todos los permisos disponibles
  getPermisos: async () => {
    const response = await api.get('/usuarios/permisos');
    return response.data;
  },

  // NUEVO: Obtener permisos de un usuario específico
  getUserPermisos: async (id) => {
    const response = await api.get(`/usuarios/${id}/permisos`);
    return response.data;
  },
};

// Servicios de reportes
export const reporteService = {
  getDashboard: async () => {
    const response = await api.get('/reportes/dashboard');
    return response.data;
  },

  exportExcel: async (type, filters = {}) => {
    const response = await api.get(`/reportes/excel/${type}`, { 
      params: filters,
      responseType: 'blob'
    });
    return response.data;
  },

  exportPDF: async (type, filters = {}) => {
    const response = await api.get(`/reportes/pdf/${type}`, { 
      params: filters,
      responseType: 'blob'
    });
    return response.data;
  },
};

export default api;

