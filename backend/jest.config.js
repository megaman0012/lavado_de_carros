/**
 * Configuración de Jest - Total Clean Car
 *
 * Dos clases de prueba, en carpetas distintas:
 *
 *   tests/unitarios/   lógica pura, sin base de datos ni red. Corren siempre y
 *                      en milisegundos: son la red de seguridad del cálculo de
 *                      horarios, fechas y precios.
 *   tests/integracion/ la API de verdad con supertest contra una base de datos
 *                      PostgreSQL de pruebas. Se saltan solas, con aviso, si no
 *                      hay DATABASE_URL_TEST (ver tests/entorno.js).
 *
 * `npm test` corre las dos.  `npm run test:unitarios`, solo las primeras.
 */

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/entorno.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Las pruebas de integración comparten una única base: si dos archivos
  // truncaran tablas a la vez se pisarían entre ellos.
  maxWorkers: 1,
  // Winston escribe a disco; en las pruebas solo molesta.
  silent: true,
  // Cada prueba de integración siembra la base de cero en su beforeEach. Son
  // décimas de segundo, pero los 5 s por defecto de Jest quedan justos cuando la
  // máquina está ocupada (en el servidor conviven varios proyectos en Docker).
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/swagger.js'
  ]
};
