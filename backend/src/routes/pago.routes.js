/**
 * Rutas de Pagos - Sistema de Lavado de Carros
 * Webhook público para pasarelas de pago (Stripe/MercadoPago) una vez conectadas.
 */

const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');

// Sin authenticate: una pasarela real llama esto con su propia verificación de firma,
// no con un JWT de este sistema. No conectar a producción sin agregar esa verificación.
router.post('/webhook', pagoController.webhook);

module.exports = router;
