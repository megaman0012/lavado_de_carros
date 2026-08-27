/**
 * Configuración Centralizada - Sistema de Lavado de Carros
 */

module.exports = {
  // Servidor
  PORT: process.env.PORT || 3042,

  // Base de datos
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://lavado_user:Lavado2026@localhost:5437/lavado_db',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'lavado-carros-secret-key-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Entorno
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Email (notificaciones). Si SMTP_HOST no está definido, los correos solo se registran en el log.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Lavado de Carros <no-reply@lavadocarros.local>',

  // WhatsApp/SMS (recordatorios). Si TWILIO_ACCOUNT_SID no está definido, solo se registran en el log.
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '', // ej. whatsapp:+14155238886
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM || ''
};
