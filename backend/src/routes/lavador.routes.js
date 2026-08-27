/**
 * Rutas de Lavadores - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const lavadorController = require('../controllers/lavador.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', lavadorController.listar);
router.post('/', lavadorController.crear);
router.put('/:id', lavadorController.actualizar);
router.put('/asignaciones/:asignacionId/lavador', lavadorController.asignarLavador);

module.exports = router;
