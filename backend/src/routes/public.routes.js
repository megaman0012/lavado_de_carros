/**
 * Rutas Públicas - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');

router.get('/servicios', publicController.servicios);
router.get('/tipos-vehiculo', publicController.tiposVehiculo);
router.get('/adicionales', publicController.adicionales);
router.get('/ciudades', publicController.ciudades);
// Sectores con lavado a domicilio (hay equipo móvil activo en la ciudad)
router.get('/sectores', require('../controllers/remoto.controller').sectoresPublicos);
router.get('/estacionamientos', publicController.estacionamientos);
// Planes VIP que se ofrecen
router.get('/planes-vip', require('../controllers/vip.controller').publicos);

module.exports = router;
