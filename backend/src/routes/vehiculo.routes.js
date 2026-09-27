/**
 * Rutas de Vehículos - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const vehiculoController = require('../controllers/vehiculo.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// Cliente autenticado puede listar/crear sus vehículos
router.get('/', authenticate, vehiculoController.listar);
router.post('/', authenticate, vehiculoController.crear);

// El cliente puede editar sus vehículos (el controlador valida que sean suyos);
// sobre todo, completar el tipo de los registrados antes del catálogo de tipos
router.put('/:id', authenticate, requireRole('admin', 'operador', 'cliente'), vehiculoController.actualizar);

// Gestión interna
router.delete('/:id', authenticate, requireRole('admin', 'operador'), vehiculoController.eliminar);

module.exports = router;
