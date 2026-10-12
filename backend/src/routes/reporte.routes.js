/**
 * Rutas de Reportes - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporte.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { reservaEnAlcance } = require('../middleware/alcance.middleware');
const { limitadorReportes } = require('../middleware/rateLimit.middleware');

// El acta va antes del filtro de rol: el cliente descarga la suya y el lavador
// la de los trabajos que hizo; el control fino está en el controlador.
router.get('/reserva/:id/acta.pdf', authenticate, reservaEnAlcance, limitadorReportes, reporteController.actaServicio);

router.use(authenticate, requireRole('admin', 'operador'));

// Dashboard: "¿cómo vamos ahora?" — hoy / esta semana / este mes, siempre en vivo
router.get('/kpis', reporteController.kpis);
// Reportes: "¿cómo nos fue en este mes?" — totales del período elegido
router.get('/resumen', reporteController.resumenPeriodo);
router.get('/por-servicio', reporteController.porServicio);
router.get('/por-estacionamiento', reporteController.porEstacionamiento);
// Panel nacional: una fila por ciudad
router.get('/por-ciudad', reporteController.porCiudad);
router.get('/ingresos', reporteController.ingresos);
// Generar Excel/PDF cuesta CPU y memoria: límite aparte
router.get('/exportar/excel', limitadorReportes, reporteController.exportarExcel);
router.get('/exportar/pdf', limitadorReportes, reporteController.exportarPDF);

module.exports = router;
