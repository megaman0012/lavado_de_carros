/**
 * Rutas de Estacionamientos y Plazas - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const estacionamientoController = require('../controllers/estacionamiento.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

// Estacionamientos
router.get('/', estacionamientoController.listar);
router.get('/:id', estacionamientoController.obtener);
router.post('/', estacionamientoController.crear);
router.put('/:id', estacionamientoController.actualizar);
router.delete('/:id', estacionamientoController.eliminar);

// Plazas (incluye bahías de lavado)
router.get('/:id/plazas', estacionamientoController.listarPlazas);
router.post('/plazas', estacionamientoController.crearPlaza);
router.put('/plazas/:id', estacionamientoController.actualizarPlaza);

module.exports = router;
