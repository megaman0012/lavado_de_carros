/**
 * Total Clean Car - Arranque del servidor
 * Puerto 3042
 *
 * La app Express vive en `app.js`. Acá queda todo lo que tiene efectos sobre el
 * sistema —abrir el puerto y programar el cron— para que las pruebas puedan
 * importar la app sin levantar nada.
 */

const app = require('./app');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 3042;

app.listen(PORT, '0.0.0.0', () => {
  logger.info('Server', `🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
});

// Recordatorios de reserva (WhatsApp/SMS) todos los días a las 18:00, para el día siguiente.
// La hora es la del negocio (APP_TZ): el contenedor corre en UTC y sin `timezone`
// el envío salía a las 13:00 de Ecuador.
const cron = require('node-cron');
const { enviarRecordatoriosDelDia } = require('./services/recordatorio.service');
const { APP_TZ } = require('./utils/fechas');
cron.schedule('0 18 * * *', () => {
  enviarRecordatoriosDelDia().catch((error) => logger.error(`Recordatorios: error en el cron diario: ${error.message}`));
}, { timezone: APP_TZ });

module.exports = app;
