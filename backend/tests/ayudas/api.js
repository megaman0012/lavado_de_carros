/**
 * Atajos para las pruebas de integración: la app de Express sin servidor
 * (app.js no abre el puerto), inicio de sesión y fechas futuras.
 */

const request = require('supertest');
const app = require('../../src/app');
const fechas = require('../../src/utils/fechas');
const { CLAVE } = require('./bd');

/** Inicia sesión y devuelve { token, refresh_token, usuario }. */
const entrar = async (username, password = CLAVE) => {
  const r = await request(app).post('/api/auth/login').send({ username, password });
  if (r.status !== 200) {
    throw new Error(`No se pudo iniciar sesión como "${username}": ${r.status} ${r.body?.message || ''}`);
  }
  return r.body.data;
};

/** Agrega el header Authorization a una petición de supertest. */
const con = (peticion, token) => peticion.set('Authorization', `Bearer ${token}`);

/**
 * Un día futuro "YYYY-MM-DD" en la zona del negocio. Las reservas se piden
 * siempre a futuro: usar "hoy" haría que la prueba fallara por la tarde, cuando
 * las franjas de la mañana ya pasaron.
 */
const enDias = (n = 1) => fechas.aISO(fechas.sumarDias(fechas.hoy(), n));

module.exports = { app, request, entrar, con, enDias };
