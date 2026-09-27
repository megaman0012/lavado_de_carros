/**
 * Rutas Públicas - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');

router.get('/servicios', publicController.servicios);
router.get('/tipos-vehiculo', publicController.tiposVehiculo);
router.get('/adicionales', publicController.adicionales);
router.get('/estacionamientos', publicController.estacionamientos);

module.exports = router;
