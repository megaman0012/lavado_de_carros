/**
 * Rutas de Autenticación - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { limitadorLogin, limitadorRefresh, limitadorRegistro } = require('../middleware/rateLimit.middleware');

// Público (con límite propio: fuerza bruta y registro masivo)
router.post('/registrar', limitadorRegistro, authController.registrar);
router.post('/login', limitadorLogin, authController.login);

// Renovación de la sesión. No lleva `authenticate` a propósito: se llama
// justamente cuando el token de acceso ya venció. Lo que autentica acá es el
// refresh token del cuerpo (ver services/sesion.service.js).
router.post('/refresh', limitadorRefresh, authController.refrescar);
// Cerrar sesión revoca el refresh token en el servidor. Tampoco exige un acceso
// válido: si venció, el usuario igual tiene derecho a cerrar su sesión.
router.post('/logout', authController.cerrarSesion);

// Autenticado
router.get('/perfil', authenticate, authController.perfil);

module.exports = router;
