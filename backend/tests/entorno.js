/**
 * Entorno de las pruebas. Se carga ANTES de cualquier archivo de prueba
 * (jest.config.js → setupFiles), que es lo que importa: `src/db.js` crea el
 * PrismaClient al ser requerido y lee DATABASE_URL en ese momento.
 *
 * REGLA DE ORO: las pruebas de integración vacían tablas. Nunca pueden apuntar a
 * la base real. Por eso:
 *   - la URL se toma de DATABASE_URL_TEST, nunca de DATABASE_URL;
 *   - si no está definida, se BORRA DATABASE_URL y las pruebas de integración se
 *     saltan solas, en vez de caer por descuido sobre la base de producción;
 *   - además, tests/ayudas/bd.js se niega a tocar una base cuyo nombre no
 *     termine en "test".
 */

process.env.NODE_ENV = 'test';
// Secreto fijo: las pruebas firman y verifican tokens, y no deben depender del .env real.
process.env.JWT_SECRET = 'secreto-solo-para-pruebas';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
// Zona del negocio: de ella dependen "hoy" y "la franja ya pasó".
process.env.APP_TZ = 'America/Guayaquil';
// Sin esto, una prueba que hace 11 logins fallidos seguidos choca con el límite
// del login en vez de probar lo que quería probar.
process.env.RATE_LIMIT_OFF = 'true';
// Correos y WhatsApp quedan en modo "solo log" (es el comportamiento sin credenciales).
process.env.SMTP_HOST = '';
process.env.TWILIO_ACCOUNT_SID = '';

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
} else {
  delete process.env.DATABASE_URL;
}
