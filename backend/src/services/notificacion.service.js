/**
 * Notificaciones por email al cliente - Total Clean Car
 * Se disparan en creación, confirmación y completado de la reserva.
 */

const { enviarCorreo } = require('./mail.service');
const fechas = require('../utils/fechas');

const plantilla = (titulo, cuerpoHtml) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <h2 style="color: #3459A5; margin-bottom: 4px;">${titulo}</h2>
    ${cuerpoHtml}
    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Total Clean Car</p>
  </div>
`;

const detalleReserva = (reserva) => `
  <p><strong>${reserva.tipoServicio?.nombre || 'Servicio'}</strong><br>
  ${fechas.formatoCorto(reserva.fecha)} · ${reserva.hora_inicio}–${reserva.hora_fin}
  ${reserva.estacionamiento ? `<br>${reserva.estacionamiento.nombre}` : ''}
  ${reserva.adicionales?.length ? `<br>Adicionales: ${reserva.adicionales.map((a) => a.nombre).join(', ')}` : ''}
  ${reserva.precio_final != null ? `<br>Total: $${reserva.precio_final.toFixed(2)}` : ''}</p>
  <p>Código: <strong>${reserva.codigo}</strong></p>
`;

const notificarCreacion = (reserva) => enviarCorreo({
  to: reserva.cliente?.email,
  subject: `Reserva ${reserva.codigo} recibida`,
  html: plantilla('Reserva recibida', `
    <p>Hola ${reserva.cliente?.nombre || ''}, recibimos tu solicitud de lavado.</p>
    ${detalleReserva(reserva)}
    <p>Te avisaremos por este correo cuando quede confirmada.</p>
  `)
});

const notificarConfirmacion = (reserva) => enviarCorreo({
  to: reserva.cliente?.email,
  subject: `Reserva ${reserva.codigo} confirmada`,
  html: plantilla('Reserva confirmada', `
    <p>Hola ${reserva.cliente?.nombre || ''}, tu lavado quedó confirmado.</p>
    ${detalleReserva(reserva)}
  `)
});

const notificarCompletado = (reserva) => enviarCorreo({
  to: reserva.cliente?.email,
  subject: `Reserva ${reserva.codigo} completada`,
  html: plantilla('¡Tu vehículo está listo!', `
    <p>Hola ${reserva.cliente?.nombre || ''}, terminamos el lavado de tu vehículo.</p>
    ${detalleReserva(reserva)}
    <p>Puedes ver las fotos antes/después ingresando a "Mis Reservas".</p>
  `)
});

// Resultado de la verificación del comprobante que subió el cliente
const notificarPagoVerificado = (reserva, pago, aprobado, motivo) => enviarCorreo({
  to: reserva.cliente?.email,
  subject: `Pago de la reserva ${reserva.codigo} ${aprobado ? 'confirmado' : 'rechazado'}`,
  html: plantilla(aprobado ? 'Pago confirmado' : 'No pudimos validar tu pago', `
    <p>Hola ${reserva.cliente?.nombre || ''}, ${aprobado
      ? `confirmamos tu pago de <strong>$${pago.monto.toFixed(2)}</strong>.`
      : `revisamos el comprobante de <strong>$${pago.monto.toFixed(2)}</strong> que enviaste y no pudimos validarlo.`}</p>
    ${detalleReserva(reserva)}
    ${!aprobado && motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
    ${!aprobado ? '<p>Puedes volver a subir el comprobante desde "Mis Reservas" o comunicarte con nosotros.</p>' : ''}
  `)
});

module.exports = { notificarCreacion, notificarConfirmacion, notificarCompletado, notificarPagoVerificado };
