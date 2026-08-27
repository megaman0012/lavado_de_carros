/**
 * Ruta de Recordatorios - Sistema de Lavado de Carros
 * Disparo manual (además del cron diario) para operar/probar sin esperar al horario programado.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { enviarRecordatoriosDelDia } = require('../services/recordatorio.service');

router.post('/enviar', authenticate, requireRole('admin', 'operador'), async (req, res) => {
  try {
    const resultado = await enviarRecordatoriosDelDia();
    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error enviando recordatorios:', error);
    res.status(500).json({ success: false, message: 'Error al enviar recordatorios' });
  }
});

module.exports = router;
