/**
 * Rutas de Pagos - Sistema de Lavado de Carros
 * Webhook público para pasarelas de pago (Stripe/MercadoPago) una vez conectadas.
 */

const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { limitadorWebhook } = require('../middleware/rateLimit.middleware');

// Sin authenticate: una pasarela real llama esto con su propia verificación de firma,
// no con un JWT de este sistema. No conectar a producción sin agregar esa verificación.
router.post('/webhook', limitadorWebhook, pagoController.webhook);

// Bandeja de comprobantes que subieron los clientes y esperan validación
router.get('/pendientes', authenticate, requireRole('admin', 'operador'), pagoController.pendientes);

module.exports = router;
