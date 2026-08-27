/**
 * Servicio de Email - Sistema de Lavado de Carros
 * Si no hay SMTP configurado (SMTP_HOST vacío), el correo solo se registra en el log
 * en vez de fallar; así el sistema funciona en desarrollo sin credenciales reales.
 */

const nodemailer = require('nodemailer');
const config = require('../config');
const { logger } = require('../utils/logger');

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
    })
  : null;

// Nunca lanza: un fallo de correo no debe romper el flujo de la reserva.
const enviarCorreo = async ({ to, subject, html }) => {
  if (!to) return;

  if (!transporter) {
    logger.warn(`Mail: SMTP no configurado — se omite envío a ${to}: "${subject}"`);
    return;
  }

  try {
    await transporter.sendMail({ from: config.SMTP_FROM, to, subject, html });
    logger.info(`Mail: enviado a ${to}: "${subject}"`);
  } catch (error) {
    logger.error(`Mail: error enviando a ${to} ("${subject}"): ${error.message}`);
  }
};

module.exports = { enviarCorreo };
