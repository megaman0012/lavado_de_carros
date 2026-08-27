/**
 * Rutas de Vehículos - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const vehiculoController = require('../controllers/vehiculo.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// Cliente autenticado puede listar/crear sus vehículos
router.get('/', authenticate, vehiculoController.listar);
router.post('/', authenticate, vehiculoController.crear);

// Gestión interna
router.put('/:id', authenticate, requireRole('admin', 'operador'), vehiculoController.actualizar);
router.delete('/:id', authenticate, requireRole('admin', 'operador'), vehiculoController.eliminar);

module.exports = router;
