// frontend/src/services/dniService.js
/**
 * Servicio para consultar DNI/RUC usando APISPeru
 * Documentación: https://apisperu.com/servicios/dniruc/
 */

const APISPERU_TOKEN = import.meta.env.VITE_APISPERU_TOKEN;
const APISPERU_URL = import.meta.env.VITE_APISPERU_URL || 'https://dniruc.apisperu.com/api/v1';

/**
 * Consultar DNI en RENIEC
 * @param {string} dni - Número de DNI (8 dígitos)
 * @returns {Promise<{nombres: string, apellidoPaterno: string, apellidoMaterno: string}>}
 */
export async function consultarDNI(dni) {
  if (!APISPERU_TOKEN || APISPERU_TOKEN === 'tu_token_aqui') {
    throw new Error('Token de APISPeru no configurado. Configura VITE_APISPERU_TOKEN en .env.local');
  }

  if (!/^\d{8}$/.test(dni)) {
    throw new Error('El DNI debe tener 8 dígitos');
  }

  try {
    const response = await fetch(`${APISPERU_URL}/dni/${dni}?token=${APISPERU_TOKEN}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('DNI no encontrado en RENIEC');
      }
      if (response.status === 401) {
        throw new Error('Token de API inválido');
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Si la API devuelve success: false
    if (data.success === false) {
      throw new Error(data.message || 'Error al consultar DNI');
    }

    return {
      dni: data.dni,
      nombres: data.nombres,
      apellidoPaterno: data.apellidoPaterno,
      apellidoMaterno: data.apellidoMaterno,
      nombreCompleto: `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim()
    };
  } catch (error) {
    console.error('Error consultando DNI:', error);
    throw error;
  }
}

/**
 * Consultar RUC en SUNAT
 * @param {string} ruc - Número de RUC (11 dígitos)
 * @returns {Promise<{razonSocial: string, nombreComercial: string, direccion: string}>}
 */
export async function consultarRUC(ruc) {
  if (!APISPERU_TOKEN || APISPERU_TOKEN === 'tu_token_aqui') {
    throw new Error('Token de APISPeru no configurado');
  }

  if (!/^\d{11}$/.test(ruc)) {
    throw new Error('El RUC debe tener 11 dígitos');
  }

  try {
    const response = await fetch(`${APISPERU_URL}/ruc/${ruc}?token=${APISPERU_TOKEN}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('RUC no encontrado en SUNAT');
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.success === false) {
      throw new Error(data.message || 'Error al consultar RUC');
    }

    return {
      ruc: data.ruc,
      razonSocial: data.razonSocial,
      nombreComercial: data.nombreComercial,
      direccion: data.direccion,
      estado: data.estado,
      condicion: data.condicion
    };
  } catch (error) {
    console.error('Error consultando RUC:', error);
    throw error;
  }
}

export default {
  consultarDNI,
  consultarRUC
};
