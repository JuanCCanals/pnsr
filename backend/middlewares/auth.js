// /Server/middlewares/auth.js
const jwt = require('jsonwebtoken');
const DEMO = process.env.DEMO_MODE === 'true';

module.exports = function authenticateToken (req, res, next) {
  if (DEMO) return next(); // 🔓 DEMO: salta auth en todas las rutas

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token requerido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Sesión expirada' });
      }
      return res.status(403).json({ message: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

