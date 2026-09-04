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

module.exports = function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Sesión expirada' });
      }
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
        const renovado = jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: DURACION_TOKEN });
        res.setHeader('X-Token-Renovado', renovado);
      }
    } catch (e) {
      console.error('No se pudo renovar el token (se continua con el actual):', e.message);
    }

    next();
  });
};
