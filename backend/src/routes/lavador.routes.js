/**
 * Rutas de Lavadores - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const lavadorController = require('../controllers/lavador.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', lavadorController.listar);
router.post('/', lavadorController.crear);
router.put('/:id', lavadorController.actualizar);
router.delete('/:id', requireRole('admin'), lavadorController.eliminar);
// Cuenta con la que el lavador entra al sistema (pantalla "Mis trabajos")
router.put('/:id/usuario', requireRole('admin'), lavadorController.guardarUsuario);
router.post('/:id/usuario/reset', requireRole('admin'), lavadorController.resetPassword);
router.put('/asignaciones/:asignacionId/lavador', lavadorController.asignarLavador);

module.exports = router;
