/**
 * Rutas de Ciudades - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const ciudadController = require('../controllers/ciudad.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireNacional } = require('../utils/alcance');

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/', ciudadController.listar);
router.post('/', requireNacional, ciudadController.crear);
router.put('/:id', requireNacional, ciudadController.actualizar);

module.exports = router;
