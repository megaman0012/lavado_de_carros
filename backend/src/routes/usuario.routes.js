/**
 * Rutas de Usuarios internos (admin y operadores) - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin'));

router.get('/', usuarioController.listar);
router.post('/', usuarioController.crear);
router.put('/:id', usuarioController.actualizar);
router.post('/:id/reset', usuarioController.resetPassword);

module.exports = router;
