/**
 * Rutas de Autenticación - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Público
router.post('/registrar', authController.registrar);
router.post('/login', authController.login);

// Autenticado
router.get('/perfil', authenticate, authController.perfil);

module.exports = router;
