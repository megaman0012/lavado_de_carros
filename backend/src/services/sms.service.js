/**
 * Servicio de WhatsApp/SMS (Twilio) - Total Clean Car
 * Mismo patrón "seguro por defecto" que mail.service.js: sin credenciales de Twilio
 * en .env, el mensaje solo se registra en el log en vez de fallar.
 */

const config = require('../config');
const { logger } = require('../utils/logger');

const client = config.TWILIO_ACCOUNT_SID
  ? require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
  : null;

// Prefiere WhatsApp si hay número configurado; si no, cae a SMS.
const enviarRecordatorio = async ({ to, body }) => {
  if (!to) return;

  if (!client || (!config.TWILIO_WHATSAPP_FROM && !config.TWILIO_SMS_FROM)) {
    logger.warn(`SMS/WhatsApp: Twilio no configurado — se omite envío a ${to}: "${body}"`);
    return;
  }

  const usarWhatsApp = !!config.TWILIO_WHATSAPP_FROM;
  const from = usarWhatsApp ? config.TWILIO_WHATSAPP_FROM : config.TWILIO_SMS_FROM;
  const destino = usarWhatsApp ? `whatsapp:${to}` : to;

  try {
    await client.messages.create({ from, to: destino, body });
    logger.info(`SMS/WhatsApp: enviado a ${to} (${usarWhatsApp ? 'WhatsApp' : 'SMS'})`);
  } catch (error) {
    logger.error(`SMS/WhatsApp: error enviando a ${to}: ${error.message}`);
  }
};

module.exports = { enviarRecordatorio };
