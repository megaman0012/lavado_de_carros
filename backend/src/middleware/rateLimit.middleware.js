/**
 * Límites de tasa (rate limiting) - Sistema de Lavado de Carros
 *
 * Objetivo: que un cliente autenticado o un anónimo no pueda martillar los
 * endpoints sensibles (fuerza bruta contra el login, subida masiva de archivos,
 * exportaciones pesadas) sin afectar el uso normal del negocio.
 *
 * Sobre la clave del límite: la API vive detrás de nginx y además publica el
 * puerto 3042, así que la IP se puede falsear con un X-Forwarded-For en una
 * llamada directa. Por eso, donde hay sesión, se limita por **id de usuario**
 * (no falseable, viene del JWT ya verificado) y el login se limita por **nombre
 * de usuario**, no solo por IP. La IP queda como criterio secundario.
 *
 * El store es en memoria: alcanza para una sola instancia, que es el despliegue
 * actual. Con varias réplicas haría falta un store compartido (Redis).
 */

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const config = require('../config');

const MINUTO = 60 * 1000;

const respuesta = (mensaje) => (req, res) => {
  res.status(429).json({ success: false, message: mensaje });
};

/**
 * Id del usuario, en el mejor esfuerzo y sin tocar la BD.
 *
 * El limitador general se monta antes de authenticate, así que ahí req.usuario
 * todavía no existe: si solo se mirara eso, todos los usuarios detrás de una
 * misma IP (una oficina con NAT, por ejemplo) compartirían un único cupo y se
 * frenarían entre ellos. Verificar la firma del JWT aquí es baratísimo (HS256,
 * sin consulta a la BD) y da una clave por persona.
 *
 * Es solo para elegir el cupo: la autorización real la sigue haciendo
 * auth.middleware, que además revalida el estado de la cuenta contra la BD.
 */
const idDeUsuario = (req) => {
  if (req.usuario?.id) return req.usuario.id;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, config.JWT_SECRET).id || null;
  } catch (e) {
    return null; // token ausente, inválido o vencido → se limita por IP
  }
};

// ipKeyGenerator normaliza IPv6 (v8 lo exige para no limitar por /128)
const porUsuarioOIp = (req) => {
  const id = idDeUsuario(req);
  return id ? `u:${id}` : `ip:${rateLimit.ipKeyGenerator(req.ip)}`;
};

const base = {
  standardHeaders: 'draft-7', // RateLimit-* para que el cliente sepa cuánto le queda
  legacyHeaders: false,
  // Con RATE_LIMIT_OFF=true se desactiva todo (útil en desarrollo y pruebas)
  skip: () => config.RATE_LIMIT_OFF
};

/**
 * Techo general de la API. Generoso a propósito: el panel dispara varias
 * llamadas por pantalla y no queremos frenar a un operador trabajando.
 */
const limitadorGeneral = rateLimit({
  ...base,
  windowMs: 5 * MINUTO,
  limit: config.RATE_LIMIT_GENERAL,
  keyGenerator: porUsuarioOIp,
  // El health check lo consulta Docker/monitoreo: no debe consumir cupo
  skip: (req) => config.RATE_LIMIT_OFF || req.path === '/health',
  handler: respuesta('Demasiadas solicitudes. Espere un momento e intente de nuevo.')
});

/**
 * Login: lo que realmente frena la fuerza bruta. Se cuenta por usuario+IP y
 * solo los intentos fallidos, así que a alguien que entra bien nunca lo toca.
 */
const limitadorLogin = rateLimit({
  ...base,
  windowMs: 15 * MINUTO,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const usuario = String(req.body?.username || '').toLowerCase().trim();
    return `login:${usuario}:${rateLimit.ipKeyGenerator(req.ip)}`;
  },
  handler: respuesta('Demasiados intentos fallidos. Espere 15 minutos antes de volver a intentar.')
});

/** Alta de cuentas desde el sitio público: evita el registro masivo. */
const limitadorRegistro = rateLimit({
  ...base,
  windowMs: 60 * MINUTO,
  limit: 5,
  keyGenerator: (req) => `reg:${rateLimit.ipKeyGenerator(req.ip)}`,
  handler: respuesta('Se alcanzó el máximo de registros por hora desde este punto de acceso.')
});

/**
 * Subida de archivos (evidencia fotográfica y comprobantes). Va después de
 * authenticate, así que limita por usuario: 30/hora cubre de sobra a un lavador
 * documentando su jornada y corta una subida automatizada.
 */
const limitadorSubidas = rateLimit({
  ...base,
  windowMs: 60 * MINUTO,
  limit: 30,
  keyGenerator: porUsuarioOIp,
  handler: respuesta('Demasiadas subidas de archivos en la última hora. Intente más tarde.')
});

/**
 * Comprobantes de pago enviados por el cliente. Más estricto: el flujo normal
 * es uno por reserva, y ya existe la regla de "uno en revisión a la vez".
 */
const limitadorComprobantes = rateLimit({
  ...base,
  windowMs: 60 * MINUTO,
  limit: 10,
  keyGenerator: porUsuarioOIp,
  handler: respuesta('Demasiados comprobantes enviados. Si tiene un problema, comuníquese con nosotros.')
});

/** Exportaciones y actas: generan Excel/PDF con imágenes, cuestan CPU y memoria. */
const limitadorReportes = rateLimit({
  ...base,
  windowMs: 10 * MINUTO,
  limit: 30,
  keyGenerator: porUsuarioOIp,
  handler: respuesta('Demasiadas descargas de reportes seguidas. Espere unos minutos.')
});

/**
 * Webhook de la pasarela: es público (sin JWT) y solo puede limitarse por IP.
 * Amplio para no descartar reintentos legítimos de la pasarela.
 */
const limitadorWebhook = rateLimit({
  ...base,
  windowMs: MINUTO,
  limit: 60,
  keyGenerator: (req) => `wh:${rateLimit.ipKeyGenerator(req.ip)}`,
  handler: respuesta('Demasiadas llamadas al webhook.')
});

module.exports = {
  limitadorGeneral,
  limitadorLogin,
  limitadorRegistro,
  limitadorSubidas,
  limitadorComprobantes,
  limitadorReportes,
  limitadorWebhook
};
