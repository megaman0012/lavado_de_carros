/**
 * Middleware de Autenticación y Roles - Sistema de Lavado de Carros
 * Roles: admin | operador | lavador | cliente
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};

// Restringe el acceso a roles específicos: requireRole('admin', 'operador')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({
      success: false,
      message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`
    });
  }
  next();
};

module.exports = { authenticate, requireRole };
