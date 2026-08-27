/**
 * Rutas Públicas - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');

router.get('/servicios', publicController.servicios);
router.get('/estacionamientos', publicController.estacionamientos);

module.exports = router;
