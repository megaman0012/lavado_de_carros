/**
 * Controlador de Pagos - Total Clean Car
 * Registro manual de pagos (efectivo/transferencia) sobre una reserva.
 * Pagos con tarjeta quedan mapeados (metodo/estado) para la pasarela de Fase 3.
 */

const crypto = require('crypto');
const prisma = require('../db');
const { firmar } = require('../utils/firmaArchivos');
const { notificarPagoVerificado } = require('../services/notificacion.service');

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

    // Comprobante de la transferencia adjuntado por el operador (opcional)
    const comprobante_url = req.file
      ? `/uploads/comprobantes/reserva-${reserva.id}/${req.file.filename}`
      : null;

    const pago = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.pago.create({
        data: {
          id_reserva: reserva.id,
          monto: montoNum,
          metodo,
          estado: 'aprobado',
          referencia: referencia?.trim() || null,
          comprobante_url,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : new Date()
        }
      });
      await tx.historialReserva.create({
        data: {
          id_reserva: reserva.id,
          accion: 'registrar_pago',
          estado_anterior: reserva.estado,
          estado_nuevo: reserva.estado,
          motivo: `Pago registrado: $${montoNum.toFixed(2)} (${metodo})${comprobante_url ? ' con comprobante' : ''}`,
          usuario: req.usuario.username
        }
      });
      return nuevo;
    });

    const totalPagado = [...reserva.pagos.filter((p) => p.estado === 'aprobado'), pago]
      .reduce((suma, p) => suma + p.monto, 0);

    res.status(201).json({
      success: true,
      data: {
        pago: { ...pago, comprobante_url: firmar(pago.comprobante_url) },
        total_pagado: totalPagado,
        saldo: Math.max((reserva.precio_final || 0) - totalPagado, 0)
      }
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
    if (pago.estado === 'en_verificacion') {
      return res.status(400).json({
        success: false,
        message: 'Este comprobante está pendiente de verificación: apruébelo o recháncelo desde "Pagos por verificar"'
      });
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


// ==================== COMPROBANTE SUBIDO POR EL CLIENTE ====================

/**
 * POST /api/reservas/:id/pagos/comprobante  (rol cliente, dueño de la reserva)
 *
 * El cliente transfiere y sube su comprobante. El pago queda en
 * 'en_verificacion': NO cuenta como ingreso ni salda la reserva hasta que un
 * operador lo apruebe. El cliente nunca puede aprobar su propio pago — eso vive
 * en verificar(), detrás de requireRole('admin','operador').
 */
const subirComprobanteCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(id) },
      include: { pagos: true }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    if (reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (['cancelada', 'no_asistio'].includes(reserva.estado)) {
      return res.status(400).json({ success: false, message: `No se puede pagar una reserva "${reserva.estado}"` });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Adjunte la imagen o el PDF del comprobante' });
    }

    // Un solo comprobante en revisión a la vez: evita que se acumulen envíos
    // repetidos y que el operador tenga que adivinar cuál corresponde.
    if (reserva.pagos.some((p) => p.estado === 'en_verificacion')) {
      return res.status(409).json({
        success: false,
        message: 'Ya tiene un comprobante en revisión para esta reserva. Espere la respuesta.'
      });
    }

    const pagado = reserva.pagos.filter((p) => p.estado === 'aprobado').reduce((sum, p) => sum + p.monto, 0);
    const saldo = Math.max((reserva.precio_final || 0) - pagado, 0);
    if (saldo <= 0) {
      return res.status(400).json({ success: false, message: 'Esta reserva no tiene saldo pendiente' });
    }

    const montoNum = parseFloat(req.body.monto);
    if (!montoNum || montoNum <= 0) {
      return res.status(400).json({ success: false, message: 'Indique el monto transferido' });
    }
    if (montoNum > saldo + 0.001) {
      return res.status(400).json({
        success: false,
        message: `El monto supera el saldo pendiente ($${saldo.toFixed(2)})`
      });
    }

    const comprobante_url = `/uploads/comprobantes/reserva-${reserva.id}/${req.file.filename}`;

    const pago = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.pago.create({
        data: {
          id_reserva: reserva.id,
          monto: montoNum,
          metodo: 'transferencia',
          estado: 'en_verificacion',
          referencia: req.body.referencia?.trim() || null,
          comprobante_url
        }
      });
      await tx.historialReserva.create({
        data: {
          id_reserva: reserva.id,
          accion: 'comprobante_recibido',
          motivo: `El cliente envió un comprobante por $${montoNum.toFixed(2)}`,
          usuario: req.usuario.username
        }
      });
      return nuevo;
    });

    res.status(201).json({
      success: true,
      data: { ...pago, comprobante_url: firmar(pago.comprobante_url) },
      message: 'Comprobante recibido. Lo validaremos y te avisaremos por correo.'
    });
  } catch (error) {
    console.error('Error recibiendo comprobante del cliente:', error);
    res.status(500).json({ success: false, message: 'Error al recibir el comprobante' });
  }
};

/**
 * PUT /api/reservas/:id/pagos/:pagoId/verificar  (admin/operador)
 * Aprueba o rechaza un comprobante enviado por el cliente.
 */
const verificar = async (req, res) => {
  try {
    const { id, pagoId } = req.params;
    const { aprobar, motivo } = req.body;

    if (typeof aprobar !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Indique si aprueba o rechaza (aprobar: true|false)' });
    }

    const pago = await prisma.pago.findUnique({ where: { id: parseInt(pagoId) } });
    if (!pago || pago.id_reserva !== parseInt(id)) {
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }
    if (pago.estado !== 'en_verificacion') {
      return res.status(400).json({ success: false, message: `Este pago ya está "${pago.estado}"` });
    }
    if (!aprobar && !motivo?.trim()) {
      return res.status(400).json({ success: false, message: 'Indique el motivo del rechazo (lo verá el cliente)' });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const p = await tx.pago.update({
        where: { id: pago.id },
        data: {
          estado: aprobar ? 'aprobado' : 'rechazado',
          ...(aprobar && { fecha_pago: new Date() })
        }
      });
      await tx.historialReserva.create({
        data: {
          id_reserva: pago.id_reserva,
          accion: aprobar ? 'comprobante_aprobado' : 'comprobante_rechazado',
          motivo: aprobar
            ? `Comprobante aprobado: $${pago.monto.toFixed(2)}`
            : `Comprobante rechazado: ${motivo.trim()}`,
          usuario: req.usuario.username
        }
      });
      return p;
    });

    // Aviso al cliente (si no hay SMTP configurado solo queda en el log)
    const reserva = await prisma.reserva.findUnique({
      where: { id: pago.id_reserva },
      include: { cliente: true, tipoServicio: true, estacionamiento: true }
    });
    notificarPagoVerificado(reserva, actualizado, aprobar, motivo).catch((e) =>
      console.error('No se pudo notificar la verificación del pago:', e.message)
    );

    res.json({
      success: true,
      data: { ...actualizado, comprobante_url: firmar(actualizado.comprobante_url) },
      message: aprobar ? 'Pago aprobado' : 'Comprobante rechazado'
    });
  } catch (error) {
    console.error('Error verificando el comprobante:', error);
    res.status(500).json({ success: false, message: 'Error al verificar el comprobante' });
  }
};

/**
 * GET /api/pagos/pendientes  (admin/operador)
 * Bandeja de comprobantes esperando validación.
 */
const pendientes = async (req, res) => {
  try {
    const pagos = await prisma.pago.findMany({
      where: { estado: 'en_verificacion' },
      include: {
        reserva: {
          include: {
            cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
            vehiculo: { select: { placa: true, marca: true, modelo: true } },
            tipoServicio: { select: { nombre: true } },
            pagos: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const data = pagos.map((p) => {
      const aprobados = p.reserva.pagos.filter((x) => x.estado === 'aprobado');
      const pagado = aprobados.reduce((sum, x) => sum + x.monto, 0);
      return {
        ...p,
        comprobante_url: firmar(p.comprobante_url),
        reserva: {
          ...p.reserva,
          pagos: undefined,
          total_pagado: pagado,
          saldo: Math.max((p.reserva.precio_final || 0) - pagado, 0)
        }
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando comprobantes pendientes:', error);
    res.status(500).json({ success: false, message: 'Error al listar los comprobantes pendientes' });
  }
};

module.exports = { registrar, anular, subirComprobanteCliente, verificar, pendientes, iniciarTarjeta, webhook };
