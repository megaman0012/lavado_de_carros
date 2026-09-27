/**
 * Rutas de Reportes - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporte.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { limitadorReportes } = require('../middleware/rateLimit.middleware');

// El acta va antes del filtro de rol: el cliente descarga la suya y el lavador
// la de los trabajos que hizo; el control fino está en el controlador.
router.get('/reserva/:id/acta.pdf', authenticate, limitadorReportes, reporteController.actaServicio);

router.use(authenticate, requireRole('admin', 'operador'));

router.get('/kpis', reporteController.kpis);
router.get('/por-servicio', reporteController.porServicio);
router.get('/por-estacionamiento', reporteController.porEstacionamiento);
router.get('/ingresos', reporteController.ingresos);
// Generar Excel/PDF cuesta CPU y memoria: límite aparte
router.get('/exportar/excel', limitadorReportes, reporteController.exportarExcel);
router.get('/exportar/pdf', limitadorReportes, reporteController.exportarPDF);

module.exports = router;
