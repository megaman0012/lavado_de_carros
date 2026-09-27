/**
 * Rutas de Autenticación - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { limitadorLogin, limitadorRegistro } = require('../middleware/rateLimit.middleware');

// Público (con límite propio: fuerza bruta y registro masivo)
router.post('/registrar', limitadorRegistro, authController.registrar);
router.post('/login', limitadorLogin, authController.login);

// Autenticado
router.get('/perfil', authenticate, authController.perfil);

module.exports = router;
