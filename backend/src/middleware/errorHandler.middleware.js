/**
 * Middleware de manejo de errores uniforme
 */

const { logger } = require('../utils/logger');

const formatoError = (message, error = null, statusCode = 500) => ({
  success: false,
  message,
  ...(process.env.NODE_ENV === 'development' && error && { error: error.toString() })
});

const errorHandler = (err, req, res, next) => {
  logger.error('ErrorHandler', err.message, {
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  const statusCode = err.statusCode || err.status || 500;
  let message = err.message;

  if (err.name === 'ValidationError') {
    message = 'Error de validación';
  } else if (err.name === 'UnauthorizedError') {
    message = 'No autorizado';
  } else if (err.code === 'P2002') {
    message = 'Ya existe un registro con esos datos';
  } else if (err.code === 'P2025') {
    message = 'Registro no encontrado';
  }

  res.status(statusCode).json(formatoError(message, err, statusCode));
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const notFoundHandler = (req, res) => {
  res.status(404).json(formatoError('Endpoint no encontrado', null, 404));
};

module.exports = { errorHandler, asyncHandler, notFoundHandler, formatoError };
