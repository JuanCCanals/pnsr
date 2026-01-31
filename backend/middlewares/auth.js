// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');

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
    next();
  });
};
