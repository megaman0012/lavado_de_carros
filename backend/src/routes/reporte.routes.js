/**
 * Rutas de Reportes - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporte.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// El acta va antes del filtro de rol: el cliente descarga la suya y el lavador
// la de los trabajos que hizo; el control fino está en el controlador.
router.get('/reserva/:id/acta.pdf', authenticate, reporteController.actaServicio);

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/kpis', reporteController.kpis);
router.get('/por-servicio', reporteController.porServicio);
router.get('/por-estacionamiento', reporteController.porEstacionamiento);
router.get('/ingresos', reporteController.ingresos);
router.get('/exportar/excel', reporteController.exportarExcel);
router.get('/exportar/pdf', reporteController.exportarPDF);

module.exports = router;
