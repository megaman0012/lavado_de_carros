/**
 * Sistema de Lavado de Carros - Servidor Express
 * Puerto 3042
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./swagger');
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3042;

// CORS abierto (el frontend se sirve por nginx con proxy /api)
app.use(cors({ origin: true, credentials: true }));

// Logging de requests
app.use((req, res, next) => {
  logger.info('Request', `${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rutas
const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const reservaRoutes = require('./routes/reserva.routes');
const agendaRoutes = require('./routes/agenda.routes');
const clienteRoutes = require('./routes/cliente.routes');
const vehiculoRoutes = require('./routes/vehiculo.routes');
const estacionamientoRoutes = require('./routes/estacionamiento.routes');
const servicioRoutes = require('./routes/servicio.routes');
const lavadorRoutes = require('./routes/lavador.routes');
const reporteRoutes = require('./routes/reporte.routes');
const planRoutes = require('./routes/plan.routes');
const pagoRoutes = require('./routes/pago.routes');
const recordatorioRoutes = require('./routes/recordatorio.routes');

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/agenda', agendaRoutes);
// Alias para el cliente web: GET /api/mis-reservas
const reservaController = require('./controllers/reserva.controller');
const { authenticate } = require('./middleware/auth.middleware');
app.get('/api/mis-reservas', authenticate, reservaController.misReservas);
app.use('/api/reservas', reservaRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/estacionamientos', estacionamientoRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/lavadores', lavadorRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/planes', planRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/recordatorios', recordatorioRoutes);

// Evidencias fotográficas (estático)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API Lavado de Carros funcionando', timestamp: new Date() });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  logger.info('Server', `🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
});

// Recordatorios de reserva (WhatsApp/SMS) todos los días a las 18:00, para el día siguiente
const cron = require('node-cron');
const { enviarRecordatoriosDelDia } = require('./services/recordatorio.service');
cron.schedule('0 18 * * *', () => {
  enviarRecordatoriosDelDia().catch((error) => logger.error(`Recordatorios: error en el cron diario: ${error.message}`));
});

module.exports = app;
