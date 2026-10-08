/**
 * Total Clean Car - Aplicación Express
 *
 * Este módulo SOLO arma la app (middlewares + rutas) y la exporta. Quien abre el
 * puerto y programa el cron es `index.js`. Están separados para que las pruebas
 * puedan importar la app con supertest sin levantar un servidor real ni disparar
 * los recordatorios: antes `require('./index')` escuchaba en el 3042 y dejaba
 * procesos vivos que colgaban a Jest.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { verificarFirma } = require('./utils/firmaArchivos');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./swagger');
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');
const { limitadorGeneral } = require('./middleware/rateLimit.middleware');

dotenv.config();

const app = express();

// Un solo salto de proxy: nginx. Sin esto todas las peticiones llegarían con la
// IP del contenedor de nginx y el rate limiting trataría a todos los usuarios
// como uno solo. Se pone 1 (no true) a propósito: 'true' confiaría en cualquier
// X-Forwarded-For. Aun así, los límites que importan van por id de usuario o por
// nombre de usuario, que no se pueden falsear (ver rateLimit.middleware.js).
app.set('trust proxy', 1);

// Cabeceras de seguridad. Las tres decisiones que no son el default de helmet:
//
// 1. contentSecurityPolicy — el CSP por defecto prohíbe estilos y scripts
//    inline, y Swagger UI (/api/docs) los usa; quedaría una página en blanco.
//    Se afloja solo lo necesario. El HTML de la aplicación no sale de aquí: lo
//    sirve nginx desde el frontend, con su propio origen.
// 2. crossOriginResourcePolicy = cross-origin — las fotos y comprobantes de
//    /uploads se muestran con <img src="..."> desde la APK de Capacitor, que
//    corre en el origen https://localhost. Con el default ('same-origin') el
//    navegador embebido las bloquearía y el operador vería recuadros vacíos.
// 3. hsts desactivado y sin `upgrade-insecure-requests` — el despliegue actual
//    es HTTP detrás de nginx. HSTS sin TLS no protege nada y, el día que alguien
//    entre por HTTPS una sola vez, deja el dominio clavado en HTTPS por meses; y
//    `upgrade-insecure-requests` (que helmet pone por defecto) haría que el
//    navegador pidiera por HTTPS los archivos de Swagger UI, dejándolo roto.
//    Cuando haya certificado: `hsts: { maxAge: 15552000 }` y quitar el `null`.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false
}));

// CORS: el frontend web va por nginx con proxy /api (mismo origen, no necesita
// CORS). Quien sí lo necesita es la app Android empaquetada con Capacitor, que
// corre en el origen https://localhost. Con CORS_ORIGINS (lista separada por
// comas) se restringe a esos orígenes; sin definir queda abierto como antes.
const origenesPermitidos = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: origenesPermitidos.length > 0 ? origenesPermitidos : true,
  credentials: true
}));

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
const catalogoRoutes = require('./routes/catalogo.routes');

// Techo general de la API. Va antes de montar las rutas para cubrirlas a todas;
// los endpoints sensibles llevan además su propio límite, más estricto.
app.use('/api', limitadorGeneral);

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
app.use('/api/tipos-vehiculo', catalogoRoutes.tiposVehiculo);
app.use('/api/adicionales', catalogoRoutes.adicionales);
app.use('/api/lavadores', lavadorRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/planes', planRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/recordatorios', recordatorioRoutes);

// Evidencias fotográficas (estático)
// Los archivos subidos (evidencia fotográfica, comprobantes de transferencia) se
// sirven solo con una URL firmada y vigente; la API las entrega ya firmadas.
app.use('/uploads', verificarFirma, express.static(path.join(__dirname, '../uploads')));

// Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API Total Clean Car funcionando', timestamp: new Date() });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
