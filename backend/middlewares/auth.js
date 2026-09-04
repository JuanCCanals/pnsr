// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');

// El token dura 24 h. Antes vencia de golpe: si el vencimiento caia mientras un
// operador tenia el formulario abierto, al pulsar "Guardar" la peticion volvia
// 401, el frontend limpiaba la sesion y recargaba la pagina, y se perdia todo lo
// que habia escrito.
//
// Ahora la sesion es deslizante: en cada peticion valida, si al token le queda
// menos de RENOVAR_SI_QUEDA_MENOS_DE, se emite uno nuevo y se devuelve en la
// cabecera X-Token-Renovado (el frontend lo guarda). Un usuario que trabaja a
// diario nunca llega al vencimiento.
const DURACION_TOKEN = '24h';
const RENOVAR_SI_QUEDA_MENOS_DE = 12 * 60 * 60; // segundos

// Hora de Lima en formato legible. forever no antepone marca de tiempo a lo que
// escribe la aplicacion, asi que sin esto las lineas del log no se pueden cruzar
// con la hora que reporta el operador.
const hora = (epochSegundos) =>
  new Date((epochSegundos ?? Math.floor(Date.now() / 1000)) * 1000)
    .toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });

module.exports = function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      // Se deja constancia en el log. Cuando un operador dice que perdio el
      // formulario, esta es la unica forma de saber despues si fue por la
      // sesion: sin registro habria que deducirlo. Se marca con [SESION] para
      // poder filtrarlo:  grep '\[SESION\]' /var/log/forever/pnsr.log
      let p = null;
      try { p = jwt.decode(token); } catch { /* token ilegible */ }
      const quien = p?.email || 'desconocido';
      const donde = `${req.method} ${req.originalUrl}`;

      if (err.name === 'TokenExpiredError') {
        // Se vuelca la vida completa del token. Sin estos datos no se puede
        // distinguir "caduco a las 24 h, es lo esperado" de "caduco antes de
        // tiempo", que son dos problemas totalmente distintos. `renovaciones`
        // dice si la sesion deslizante llego a actuar en esa sesion: si sale 0
        // es que el navegador no esta guardando el token renovado.
        const vidaHoras = p?.iat && p?.exp ? ((p.exp - p.iat) / 3600).toFixed(1) : '?';
        const vencidoHaceMin = p?.exp ? ((Math.floor(Date.now() / 1000) - p.exp) / 60).toFixed(1) : '?';
        console.warn(
          `[SESION] ${hora()} | Token vencido | usuario=${quien} | ${donde} | ip=${req.ip}` +
          ` | emitido=${p?.iat ? hora(p.iat) : '?'} | vencia=${p?.exp ? hora(p.exp) : '?'}` +
          ` | vida=${vidaHoras}h | vencido_hace=${vencidoHaceMin}min | renovaciones=${p?.ren ?? 0}`
        );
        return res.status(401).json({ message: 'Sesión expirada' });
      }
      console.warn(`[SESION] ${hora()} | Token invalido (${err.name}) | usuario=${quien} | ${donde} | ip=${req.ip}`);
      return res.status(403).json({ message: 'Token inválido' });
    }

    // payload viene de jwt.sign({ id, email, rol, ... })
    req.user = payload;

    // Renovacion best-effort: si algo falla aqui, la peticion sigue su curso
    // normalmente con el token que ya traia.
    try {
      const restante = payload.exp - Math.floor(Date.now() / 1000);
      if (restante > 0 && restante < RENOVAR_SI_QUEDA_MENOS_DE) {
        const { iat, exp, ...datos } = payload;
        // `ren` cuenta las renovaciones. Viaja dentro del token, asi que si algun
        // dia vuelve a vencer sabremos si el navegador estuvo guardando los
        // tokens renovados o los estuvo ignorando.
        datos.ren = (Number(payload.ren) || 0) + 1;
        const renovado = jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: DURACION_TOKEN });
        res.setHeader('X-Token-Renovado', renovado);
      }
    } catch (e) {
      console.error('No se pudo renovar el token (se continua con el actual):', e.message);
    }

    next();
  });
};
