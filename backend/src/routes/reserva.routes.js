/**
 * Rutas de Reservas - Sistema de Lavado de Carros
 */

const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reserva.controller');
const pagoController = require('../controllers/pago.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { upload, uploadComprobante } = require('../config/upload');

// Cliente autenticado
router.get('/mis-reservas', authenticate, reservaController.misReservas);
// Lavador autenticado
router.get('/mis-trabajos', authenticate, requireRole('lavador'), reservaController.misTrabajos);
router.post('/', authenticate, reservaController.crear);
router.get('/:id', authenticate, reservaController.obtenerPorId);
router.put('/:id/cancelar', authenticate, (req, res, next) => {
  // El cliente puede cancelar la suya; interno también
  req.accion = 'cancelar';
  req.nuevoEstado = 'cancelada';
  next();
}, reservaController.cambiarEstado);

// Interno: listado y workflow
router.get('/', authenticate, requireRole('admin', 'operador'), reservaController.listar);
router.put('/:id/asignar-lavador', authenticate, requireRole('admin', 'operador'), reservaController.asignarLavador);
router.put('/:id/confirmar', authenticate, requireRole('admin', 'operador'), (req, res, next) => {
  req.accion = 'confirmar'; req.nuevoEstado = 'confirmada'; next();
}, reservaController.cambiarEstado);
router.put('/:id/iniciar', authenticate, requireRole('admin', 'operador', 'lavador'), (req, res, next) => {
  req.accion = 'iniciar'; req.nuevoEstado = 'en_proceso'; next();
}, reservaController.cambiarEstado);
router.put('/:id/completar', authenticate, requireRole('admin', 'operador', 'lavador'), (req, res, next) => {
  req.accion = 'completar'; req.nuevoEstado = 'completada'; next();
}, reservaController.cambiarEstado);
router.put('/:id/no-asistio', authenticate, requireRole('admin', 'operador'), (req, res, next) => {
  req.accion = 'no_asistio'; req.nuevoEstado = 'no_asistio'; next();
}, reservaController.cambiarEstado);

// Evidencia fotográfica: admin/operador/lavador (el lavador solo sus trabajos)
// El wrapper convierte errores de multer (tipo/size) en 400 legible
const subirConUpload = (req, res, next) => {
  upload.array('fotos', 6)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};
router.post('/:id/evidencia', authenticate, requireRole('admin', 'operador', 'lavador'),
  subirConUpload, reservaController.subirEvidencia);

// Pagos manuales (efectivo/transferencia) sobre la reserva
const subirComprobante = (req, res, next) => {
  uploadComprobante.single('comprobante')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};
router.post('/:id/pagos', authenticate, requireRole('admin', 'operador'), subirComprobante, pagoController.registrar);
router.delete('/:id/pagos/:pagoId', authenticate, requireRole('admin'), pagoController.anular);
// Pago con tarjeta (gateway-agnóstico, ver pago.controller.js) — cliente propietario o interno
router.post('/:id/pagos/tarjeta', authenticate, requireRole('admin', 'operador', 'cliente'), pagoController.iniciarTarjeta);

// Calificación del cliente (una vez, sobre reserva completada)
router.post('/:id/calificacion', authenticate, requireRole('cliente'), reservaController.calificar);

module.exports = router;
