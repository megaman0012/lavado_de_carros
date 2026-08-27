/**
 * Controlador de Pagos - Sistema de Lavado de Carros
 * Registro manual de pagos (efectivo/transferencia) sobre una reserva.
 * Pagos con tarjeta quedan mapeados (metodo/estado) para la pasarela de Fase 3.
 */

const crypto = require('crypto');
const prisma = require('../db');

const METODOS_MANUALES = ['efectivo', 'transferencia'];

// Registrar pago manual (admin/operador)
const registrar = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, metodo, referencia, fecha_pago } = req.body;

    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      return res.status(400).json({ success: false, message: 'El monto debe ser mayor a cero' });
    }
    if (!METODOS_MANUALES.includes(metodo)) {
      return res.status(400).json({ success: false, message: `Método inválido. Use: ${METODOS_MANUALES.join(' o ')}` });
    }

    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(id) },
      include: { pagos: true }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    if (['cancelada', 'no_asistio'].includes(reserva.estado)) {
      return res.status(400).json({ success: false, message: `No se puede registrar un pago sobre una reserva "${reserva.estado}"` });
    }

    const pago = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.pago.create({
        data: {
          id_reserva: reserva.id,
          monto: montoNum,
          metodo,
          estado: 'aprobado',
          referencia: referencia?.trim() || null,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : new Date()
        }
      });
      await tx.historialReserva.create({
        data: {
          id_reserva: reserva.id,
          accion: 'registrar_pago',
          estado_anterior: reserva.estado,
          estado_nuevo: reserva.estado,
          motivo: `Pago registrado: $${montoNum.toFixed(2)} (${metodo})`,
          usuario: req.usuario.username
        }
      });
      return nuevo;
    });

    const totalPagado = [...reserva.pagos.filter((p) => p.estado === 'aprobado'), pago]
      .reduce((suma, p) => suma + p.monto, 0);

    res.status(201).json({
      success: true,
      data: { pago, total_pagado: totalPagado, saldo: Math.max((reserva.precio_final || 0) - totalPagado, 0) }
    });
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({ success: false, message: 'Error al registrar el pago' });
  }
};

// Anular un pago registrado por error (admin)
const anular = async (req, res) => {
  try {
    const { id, pagoId } = req.params;
    const pago = await prisma.pago.findUnique({ where: { id: parseInt(pagoId) } });
    if (!pago || pago.id_reserva !== parseInt(id)) {
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }
    if (pago.estado === 'rechazado') {
      return res.status(400).json({ success: false, message: 'Este pago ya está anulado' });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const p = await tx.pago.update({ where: { id: pago.id }, data: { estado: 'rechazado' } });
      await tx.historialReserva.create({
        data: {
          id_reserva: parseInt(id),
          accion: 'anular_pago',
          motivo: `Pago anulado: $${pago.monto.toFixed(2)} (${pago.metodo})`,
          usuario: req.usuario.username
        }
      });
      return p;
    });

    res.json({ success: true, data: actualizado });
  } catch (error) {
    console.error('Error anulando pago:', error);
    res.status(500).json({ success: false, message: 'Error al anular el pago' });
  }
};

// Inicia un pago con tarjeta (gateway-agnóstico). Crea un Pago "pendiente" con una
// referencia única; una pasarela real (Stripe/MercadoPago) lo confirmaría vía webhook().
// Sin SDK conectado todavía: ver DOCUMENTACION_TECNICA.md para cómo integrar una.
const iniciarTarjeta = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(id) }, include: { pagos: true } });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    if (req.usuario.rol === 'cliente' && reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (['cancelada', 'no_asistio'].includes(reserva.estado)) {
      return res.status(400).json({ success: false, message: `No se puede pagar una reserva "${reserva.estado}"` });
    }

    const pagado = reserva.pagos.filter((p) => p.estado === 'aprobado').reduce((s, p) => s + p.monto, 0);
    const saldo = Math.max((reserva.precio_final || 0) - pagado, 0);
    if (saldo <= 0) {
      return res.status(400).json({ success: false, message: 'Esta reserva no tiene saldo pendiente' });
    }

    const referencia = `PEND-${reserva.id}-${crypto.randomBytes(4).toString('hex')}`;
    const pago = await prisma.pago.create({
      data: { id_reserva: reserva.id, monto: saldo, metodo: 'tarjeta', estado: 'pendiente', referencia }
    });

    res.status(201).json({
      success: true,
      data: pago,
      message: 'Pasarela de pago no conectada todavía; este pago queda "pendiente" hasta integrar Stripe/MercadoPago.'
    });
  } catch (error) {
    console.error('Error iniciando pago con tarjeta:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar el pago' });
  }
};

// Webhook gateway-agnóstico (público): una pasarela real llamaría aquí -con su propia
// verificación de firma- para confirmar o rechazar un pago creado por iniciarTarjeta.
const webhook = async (req, res) => {
  try {
    const { referencia, estado } = req.body;
    if (!referencia || !['aprobado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'referencia y estado (aprobado|rechazado) son obligatorios' });
    }

    const pago = await prisma.pago.findFirst({ where: { referencia } });
    if (!pago) return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    if (pago.estado !== 'pendiente') {
      return res.status(400).json({ success: false, message: `Este pago ya está "${pago.estado}"` });
    }

    await prisma.$transaction(async (tx) => {
      await tx.pago.update({ where: { id: pago.id }, data: { estado, fecha_pago: new Date() } });
      await tx.historialReserva.create({
        data: {
          id_reserva: pago.id_reserva,
          accion: estado === 'aprobado' ? 'pago_tarjeta_aprobado' : 'pago_tarjeta_rechazado',
          motivo: `Pago con tarjeta ${estado}: $${pago.monto.toFixed(2)} (ref. ${referencia})`
        }
      });
    });

    res.json({ success: true, message: 'Webhook procesado' });
  } catch (error) {
    console.error('Error procesando webhook de pago:', error);
    res.status(500).json({ success: false, message: 'Error al procesar el webhook' });
  }
};

module.exports = { registrar, anular, iniciarTarjeta, webhook };
