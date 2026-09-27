/**
 * Rutas de Servicios - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const servicioController = require('../controllers/servicio.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', servicioController.listar);
router.get('/:id', servicioController.obtener);
router.post('/', servicioController.crear);
router.put('/:id', servicioController.actualizar);
router.delete('/:id', servicioController.eliminar);

module.exports = router;
