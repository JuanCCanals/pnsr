// frontend/src/utils/fecha.js
//
// Todo el sistema opera en hora de Lima (UTC-5), pero el codigo usaba
// `new Date().toISOString()`, que devuelve hora UNIVERSAL. A partir de las 19:00
// de Lima en UTC ya es el dia siguiente, asi que:
//
//   - los reportes exportados de tarde salian con la fecha de manana en el
//     nombre del archivo;
//   - y, mas grave, los formularios que proponen "hoy" como fecha por defecto
//     (ventas de cajas, donaciones, integracion) proponian manana.
//
// Estas dos funciones son la unica forma correcta de obtener una fecha
// 'YYYY-MM-DD' en este proyecto. El locale 'en-CA' es el que produce ese
// formato de manera nativa.

const LIMA_YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** La fecha de hoy en Lima, como 'YYYY-MM-DD'. */
export function hoyLima() {
  return LIMA_YMD.format(new Date());
}

/**
 * Convierte a 'YYYY-MM-DD' en hora de Lima.
 *
 * Las columnas DATE llegan del backend como 'YYYY-MM-DD' sin hora y se
 * devuelven tal cual: convertirlas a Date volveria a introducir el desfase.
 * Las columnas TIMESTAMP llegan como fecha ISO y si se convierten.
 */
export function aYMDLima(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d)) return typeof v === 'string' ? v.slice(0, 10) : '';
  return LIMA_YMD.format(d);
}
