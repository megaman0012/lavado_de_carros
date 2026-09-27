/**
 * Rutas de catálogos auxiliares - Total Clean Car
 * Montadas en /api/tipos-vehiculo y /api/adicionales (ver index.js).
 * La lectura pública (para el portal de reservas) está en /api/public.
 */

const express = require('express');
const catalogo = require('../controllers/catalogo.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const soloInterno = [authenticate, requireRole('admin', 'operador')];

const tiposVehiculo = express.Router();
tiposVehiculo.use(...soloInterno);
tiposVehiculo.get('/', catalogo.listarTiposVehiculo);
tiposVehiculo.post('/', catalogo.crearTipoVehiculo);
tiposVehiculo.put('/:id', catalogo.actualizarTipoVehiculo);

const adicionales = express.Router();
adicionales.use(...soloInterno);
adicionales.get('/', catalogo.listarAdicionales);
adicionales.post('/', catalogo.crearAdicional);
adicionales.put('/:id', catalogo.actualizarAdicional);

module.exports = { tiposVehiculo, adicionales };
