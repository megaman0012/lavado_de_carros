/**
 * Rutas de Planes y Suscripciones - Sistema de Lavado de Carros
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

module.exports = router;
