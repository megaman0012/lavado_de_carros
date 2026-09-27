/**
 * Recordatorios de reserva - Total Clean Car
 * Reduce no-shows: avisa por WhatsApp/SMS el día anterior a la reserva.
 * Idempotente: no reenvía si ya hay un 'recordatorio_enviado' en el historial de esa reserva.
 */

const prisma = require('../db');
const { logger } = require('../utils/logger');
const { enviarRecordatorio } = require('./sms.service');
const fechas = require('../utils/fechas');

const enviarRecordatoriosDelDia = async () => {
  const hoy = fechas.hoy();
  const manana = fechas.sumarDias(hoy, 1);
  const pasadoManana = fechas.sumarDias(hoy, 2);

  const reservas = await prisma.reserva.findMany({
    where: { fecha: { gte: manana, lt: pasadoManana }, estado: { in: ['solicitada', 'confirmada'] } },
    include: {
      cliente: { select: { nombre: true, telefono: true } },
      tipoServicio: { select: { nombre: true } },
      estacionamiento: { select: { nombre: true } },
      historial: { where: { accion: 'recordatorio_enviado' } }
    }
  });

  let enviados = 0;
  for (const reserva of reservas) {
    if (!reserva.cliente?.telefono || reserva.historial.length > 0) continue;

    const body = `Hola ${reserva.cliente.nombre}, te recordamos tu lavado (${reserva.tipoServicio?.nombre}) ` +
      `mañana ${fechas.formatoCorto(reserva.fecha)} a las ${reserva.hora_inicio}` +
      `${reserva.estacionamiento ? ` en ${reserva.estacionamiento.nombre}` : ''}. Código: ${reserva.codigo}.`;

    await enviarRecordatorio({ to: reserva.cliente.telefono, body });
    await prisma.historialReserva.create({
      data: { id_reserva: reserva.id, accion: 'recordatorio_enviado', motivo: 'Recordatorio WhatsApp/SMS del día anterior' }
    });
    enviados++;
  }

  logger.info(`Recordatorios: ${enviados} enviados de ${reservas.length} reservas de mañana`);
  return { total_reservas_manana: reservas.length, enviados };
};

module.exports = { enviarRecordatoriosDelDia };
