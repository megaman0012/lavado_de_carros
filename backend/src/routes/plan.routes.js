/**
 * Rutas de Planes y Suscripciones - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const planController = require('../controllers/plan.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', planController.listarPlanes);
router.post('/', requireRole('admin'), planController.crearPlan);
router.put('/:id', requireRole('admin'), planController.actualizarPlan);

router.get('/suscripciones', planController.listarSuscripciones);
router.post('/suscripciones', planController.crearSuscripcion);
router.put('/suscripciones/:id/cancelar', planController.cancelarSuscripcion);

// Cobros mensuales de los planes VIP
router.post('/cobros', planController.generarCobros);
router.get('/pagos', planController.listarPagos);
router.put('/pagos/:id/verificar', planController.verificarPago);
router.post('/suscripciones/:id/pagos', planController.registrarPago);

module.exports = router;
