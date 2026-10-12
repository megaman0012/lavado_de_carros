/**
 * Middleware de alcance por ciudad - Total Clean Car
 *
 * Para las rutas /api/reservas/:id/... : un operador de ciudad no puede ver ni
 * operar (confirmar, asignar, cobrar, subir evidencia...) una reserva de otra.
 * Va en la ruta y no en cada controlador para que ninguna acción nueva se
 * olvide de revisarlo. A clientes y lavadores no los toca: ellos ya están
 * limitados a sus propias reservas o a sus trabajos asignados.
 */

const prisma = require('../db');
const alcance = require('../utils/alcance');

const reservaEnAlcance = async (req, res, next) => {
  if (req.usuario?.rol !== 'operador' || !alcance.ciudadFija(req.usuario)) return next();
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) || 0 },
      select: { id_ciudad: true }
    });
    // Si no existe, que responda el controlador con su 404 de siempre
    if (reserva && !alcance.puedeVer(req.usuario, reserva.id_ciudad)) {
      return alcance.fueraDeAlcance(res);
    }
    next();
  } catch (error) {
    console.error('Error revisando el alcance de la reserva:', error);
    res.status(500).json({ success: false, message: 'Error al validar el acceso' });
  }
};

module.exports = { reservaEnAlcance };
