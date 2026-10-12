/**
 * Rutas de Servicios - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const servicioController = require('../controllers/servicio.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireNacional } = require('../utils/alcance');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', servicioController.listar);
router.get('/:id', servicioController.obtener);
// Precios y servicios valen para todo el país: los cambia solo lo nacional
router.post('/', requireNacional, servicioController.crear);
router.put('/:id', requireNacional, servicioController.actualizar);
router.delete('/:id', requireNacional, servicioController.eliminar);

module.exports = router;
