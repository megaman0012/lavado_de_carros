/**
 * Rutas de Clientes - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/cliente.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', clienteController.listar);
router.get('/:id', clienteController.obtener);
router.post('/', clienteController.crear);
router.put('/:id', clienteController.actualizar);
router.delete('/:id', clienteController.eliminar);

module.exports = router;
