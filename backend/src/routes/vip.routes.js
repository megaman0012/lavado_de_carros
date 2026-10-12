/**
 * Rutas de "Mi plan" (VIP del cliente) - Total Clean Car
 */

const express = require('express');
const router = express.Router();
const vip = require('../controllers/vip.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { uploadComprobantePlan } = require('../config/upload');
const { limitadorComprobantes } = require('../middleware/rateLimit.middleware');

const subir = (req, res, next) => {
  uploadComprobantePlan.single('comprobante')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};

router.use(authenticate, requireRole('cliente'));
router.get('/', vip.miPlan);
router.post('/', vip.suscribirme);
router.put('/cancelar', vip.cancelar);
router.post('/pagos/:id/comprobante', limitadorComprobantes, subir, vip.subirComprobante);

module.exports = router;
