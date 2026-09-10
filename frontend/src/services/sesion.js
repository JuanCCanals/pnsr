// frontend/src/services/sesion.js
//
// Custodia del acceso (token) y del usuario de la sesion.
//
// POR QUE EXISTE ESTE ARCHIVO
// Hasta ahora cada pantalla leia el token con localStorage.getItem('token') y el
// login lo guardaba con setItem, dando por hecho que el navegador siempre puede
// guardar. En una de las maquinas de la parroquia resulto que NO: ese perfil de
// Chrome podia leer lo ya guardado pero no escribir ni borrar. Consecuencia: por
// mucho que la operadora volviera a iniciar sesion, el navegador seguia
// entregando un token caducado de dias atras, el servidor lo rechazaba todo y
// era imposible trabajar. Se perdio un dia entero en diagnosticarlo, y la
// "solucion" pasaba por reparar su navegador.
//
// COMO LO RESUELVE
// La fuente de verdad durante la sesion es la MEMORIA. El navegador es solo un
// respaldo para sobrevivir a una recarga de pagina. Si el respaldo falla, la
// persona puede trabajar igual: solo perdera la sesion si recarga.
//
// Ademas se verifica la escritura releyendo lo guardado, para poder AVISAR con
// claridad en lugar de fallar de forma silenciosa.

let tokenEnMemoria = null;
let usuarioEnMemoria = null;
let respaldoConfiable = true;   // false = el navegador no esta guardando

// Una vez que la sesion se da por terminada, NO se vuelve a leer del navegador.
//
// Sin esto se producia un circulo vicioso en el equipo averiado: al rechazar el
// servidor, borrarSesion() vaciaba la memoria e intentaba borrar del navegador,
// pero ese borrado fallaba en silencio. La siguiente lectura, al no encontrar
// nada en memoria, caia de nuevo al navegador y RESUCITABA el token caducado.
// Asi, peticion tras peticion, se seguia enviando eternamente un token muerto.
let sesionInvalidada = false;

/** Escribe en el navegador y comprueba releyendo. Devuelve si quedo guardado. */
function escribirConVerificacion(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
    return localStorage.getItem(clave) === valor;
  } catch {
    return false;   // modo privado, almacenamiento lleno o perfil danado
  }
}

export function guardarToken(token) {
  tokenEnMemoria = token || null;
  if (token) sesionInvalidada = false;   // hay sesion nueva y valida
  if (!token) return true;
  const ok = escribirConVerificacion('token', token);
  if (!ok) respaldoConfiable = false;
  return ok;
}

export function guardarUsuario(usuario) {
  usuarioEnMemoria = usuario || null;
  if (!usuario) return true;
  const ok = escribirConVerificacion('user', JSON.stringify(usuario));
  if (!ok) respaldoConfiable = false;
  return ok;
}

/** La memoria manda; el navegador solo se consulta al arrancar la pagina. */
/**
 * Un token guardado solo sirve si aun no ha vencido.
 *
 * En el equipo averiado quedo atascado en el navegador un token de dias atras
 * que no se puede borrar. Cada recarga de pagina reiniciaba la marca de sesion
 * invalidada, se volvia a leer ese token muerto y se enviaba otra vez, una y
 * otra vez, incluso al intentar guardar. Descartarlo aqui corta el ciclo: el
 * navegador puede conservar basura, pero nosotros no la usamos.
 *
 * Si no se puede interpretar, se deja pasar y decide el servidor.
 */
function tokenVigente(t) {
  try {
    const { exp } = JSON.parse(atob(t.split('.')[1]));
    return !exp || exp * 1000 > Date.now();
  } catch { return true; }
}

export function leerToken() {
  // El token de MEMORIA tambien caduca. Faltaba comprobarlo, y ese descuido
  // costo una manana entera: una ventana abierta desde el dia anterior conserva
  // su token en memoria y lo seguia enviando indefinidamente. Como la memoria
  // tiene prioridad, ni borrar el almacenamiento ni recargar OTRA ventana
  // cambiaban nada; solo cerrar esa ventana concreta. Desde fuera parecia que la
  // aplicacion ignoraba todo lo que haciamos.
  if (tokenEnMemoria) {
    if (tokenVigente(tokenEnMemoria)) return tokenEnMemoria;
    tokenEnMemoria = null;
    sesionInvalidada = true;
    return null;
  }
  if (sesionInvalidada) return null;   // no resucitar lo que ya se descarto
  try {
    const t = localStorage.getItem('token');
    if (t && !tokenVigente(t)) { sesionInvalidada = true; return null; }
    return t;
  } catch { return null; }
}

export function leerUsuario() {
  if (usuarioEnMemoria) return usuarioEnMemoria;
  if (sesionInvalidada) return null;
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

/**
 * Decide si una cabecera X-Token-Renovado puede sustituir al token actual.
 *
 * El servidor renueva el token cuando le queda poca vida y lo devuelve en esa
 * cabecera. Pero el navegador puede REINYECTAR una cabecera antigua desde su
 * cache al revalidar una peticion (responde 304 y conserva las cabeceras que el
 * 304 no trae). Asi, una renovacion emitida dias atras pisaba el token recien
 * obtenido en el login y dejaba la sesion muerta sin que nada lo delatara.
 *
 * Solo se acepta si esta vigente y no es anterior al que ya tenemos.
 */
export function esRenovacionValida(nuevo, actual) {
  const leer = (t) => { try { return JSON.parse(atob(String(t).split('.')[1])); } catch { return null; } };
  const n = leer(nuevo);
  if (!n?.exp || n.exp * 1000 <= Date.now()) return false;   // ya vencida
  if (!actual) return true;
  const a = leer(actual);
  if (!a?.iat || !n.iat) return true;
  return n.iat >= a.iat;                                      // nunca ir hacia atras
}

export function borrarSesion() {
  tokenEnMemoria = null;
  usuarioEnMemoria = null;
  sesionInvalidada = true;   // aunque el navegador no lo borre, aqui ya no existe
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch { /* si no se puede borrar, la memoria ya quedo limpia */ }
}

/**
 * false cuando el navegador NO esta conservando la sesion. Se puede trabajar
 * igual, pero al recargar la pagina habra que iniciar sesion de nuevo, y
 * conviene decirselo a la persona en lugar de dejar que lo descubra sola.
 */
export function respaldoDelNavegadorFunciona() {
  return respaldoConfiable;
}
