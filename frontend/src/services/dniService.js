// frontend/src/services/dniService.js
/**
 * Servicio para consultar DNI usando dos APIs disponibles:
 * 1. APISPeru - dniruc.apisperu.com (llamada directa desde frontend)
 * 2. ApisNetPe - api.apis.net.pe (via proxy backend, evita CORS)
 */

const APISPERU_TOKEN = import.meta.env.VITE_APISPERU_TOKEN;
const APISPERU_URL = import.meta.env.VITE_APISPERU_URL || 'https://dniruc.apisperu.com/api/v1';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Consultar DNI usando APISPeru (directo desde frontend)
 */
async function consultarDNI_APISPeru(dni) {
  if (!APISPERU_TOKEN || APISPERU_TOKEN === 'tu_token_aqui') {
    throw new Error('Token de APISPeru no configurado. Configura VITE_APISPERU_TOKEN en .env.local');
  }

  const response = await fetch(`${APISPERU_URL}/dni/${dni}?token=${APISPERU_TOKEN}`);
  
  if (!response.ok) {
    if (response.status === 404) throw new Error('DNI no encontrado en RENIEC');
    if (response.status === 401) throw new Error('Token de APISPeru inválido');
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.success === false) throw new Error(data.message || 'Error al consultar DNI');

  return {
    dni: data.dni,
    nombres: data.nombres,
    apellidoPaterno: data.apellidoPaterno,
    apellidoMaterno: data.apellidoMaterno,
    nombreCompleto: `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim()
  };
}

/**
 * Consultar DNI usando apis.net.pe via proxy del backend (evita CORS)
 * Llama a: GET /api/cobros/consultar-dni/{dni}?proveedor=apisnetpe
 */
async function consultarDNI_ApisNetPe(dni) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/cobros/consultar-dni/${dni}?proveedor=apisnetpe`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || `Error ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Error al consultar DNI');

  return result.data;
}

/**
 * Consultar DNI — dispatch según proveedor
 * @param {string} dni - Número de DNI (8 dígitos)
 * @param {string} proveedor - 'apisperu' o 'apisnetpe'
 */
export async function consultarDNI(dni, proveedor = 'apisperu') {
  if (!/^\d{8}$/.test(dni)) {
    throw new Error('El DNI debe tener 8 dígitos');
  }

  try {
    if (proveedor === 'apisnetpe') {
      return await consultarDNI_ApisNetPe(dni);
    }
    return await consultarDNI_APISPeru(dni);
  } catch (error) {
    console.error(`Error consultando DNI (${proveedor}):`, error);
    throw error;
  }
}

/**
 * Consultar RUC usando APISPeru (llamada directa)
 */
async function consultarRUC_APISPeru(ruc) {
  if (!APISPERU_TOKEN || APISPERU_TOKEN === 'tu_token_aqui') {
    throw new Error('Token de APISPeru no configurado');
  }

  const response = await fetch(`${APISPERU_URL}/ruc/${ruc}?token=${APISPERU_TOKEN}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error('RUC no encontrado en SUNAT');
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.success === false) throw new Error(data.message || 'Error al consultar RUC');

  return {
    ruc: data.ruc,
    razonSocial: data.razonSocial,
    nombreComercial: data.nombreComercial,
    direccion: data.direccion,
    estado: data.estado,
    condicion: data.condicion,
    // Para reutilizar la misma UI que con DNI
    nombreCompleto: data.razonSocial || data.nombreComercial || ''
  };
}

/**
 * Consultar RUC via proxy backend (apis.net.pe)
 */
async function consultarRUC_ApisNetPe(ruc) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/cobros/consultar-ruc/${ruc}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || `Error ${response.status}`);
  }
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Error al consultar RUC');
  return result.data;
}

/**
 * Consultar RUC en SUNAT — dispatch según proveedor
 */
export async function consultarRUC(ruc, proveedor = 'apisperu') {
  if (!/^\d{11}$/.test(ruc)) {
    throw new Error('El RUC debe tener 11 dígitos');
  }
  try {
    if (proveedor === 'apisnetpe') {
      return await consultarRUC_ApisNetPe(ruc);
    }
    return await consultarRUC_APISPeru(ruc);
  } catch (error) {
    console.error(`Error consultando RUC (${proveedor}):`, error);
    throw error;
  }
}

/**
 * Consultar DNI o RUC según longitud del documento (8 ó 11 dígitos)
 */
export async function consultarDocumento(doc, proveedor = 'apisperu') {
  const d = String(doc || '').trim();
  if (/^\d{8}$/.test(d)) {
    return await consultarDNI(d, proveedor);
  }
  if (/^\d{11}$/.test(d)) {
    return await consultarRUC(d, proveedor);
  }
  throw new Error('Ingrese 8 dígitos (DNI) o 11 dígitos (RUC)');
}

export default { consultarDNI, consultarRUC };
