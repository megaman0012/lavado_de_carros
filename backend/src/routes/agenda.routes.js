/**
 * Rutas de Agenda - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const agendaController = require('../controllers/agenda.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// Disponibilidad: pública para que el cliente vea franjas al reservar
router.get('/disponibilidad', agendaController.disponibilidad);

// Vista del día y bloqueos manuales: solo personal interno
router.get('/', authenticate, requireRole('admin', 'operador', 'lavador'), agendaController.vistaDia);
router.post('/bloqueos', authenticate, requireRole('admin', 'operador'), agendaController.crearBloqueo);
router.delete('/bloqueos/:id', authenticate, requireRole('admin', 'operador'), agendaController.eliminarBloqueo);

module.exports = router;
