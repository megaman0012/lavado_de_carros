/**
 * Middleware de Autenticación y Roles - Sistema de Lavado de Carros
 * Roles: admin | operador | lavador | cliente
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../db');

/**
 * Verifica el JWT y además revalida contra la BD que la cuenta siga activa.
 * El token dura 24h, así que sin esta consulta un usuario suspendido seguiría
 * operando hasta un día entero con el token que ya tenía en el navegador.
 * También se revisa el estado de la ficha (Cliente/Lavador), porque el panel
 * suspende la ficha y el Usuario a la vez.
 */
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      include: { cliente: { select: { estado: true } }, lavador: { select: { estado: true } } }
    });

    if (!usuario || usuario.estado !== 'activo') {
      return res.status(401).json({ success: false, message: 'La cuenta está suspendida' });
    }
    if (usuario.cliente && usuario.cliente.estado !== 'activo') {
      return res.status(401).json({ success: false, message: 'La cuenta está suspendida' });
    }
    if (usuario.lavador && usuario.lavador.estado !== 'activo') {
      return res.status(401).json({ success: false, message: 'La cuenta está suspendida' });
    }

    req.usuario = decoded;
    next();
  } catch (error) {
    console.error('Error validando la sesión:', error);
    return res.status(500).json({ success: false, message: 'Error al validar la sesión' });
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
