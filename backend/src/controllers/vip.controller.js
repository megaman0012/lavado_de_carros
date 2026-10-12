/**
 * "Mi plan" — el plan VIP visto por el cliente - Total Clean Car
 *
 * El cliente ve los planes VIP, se suscribe (queda el cobro del mes),
 * sube el comprobante de cada mes y consulta cuántos lavados le quedan.
 * Los beneficios rigen solo en los meses con el pago aprobado
 * (services/beneficios.service.js). La parte del panel: plan.controller.js.
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');
const beneficios = require('../services/beneficios.service');
const planController = require('./plan.controller');

const responderError = (res, error, contexto) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  console.error(`Error ${contexto}:`, error);
  res.status(500).json({ success: false, message: `Error ${contexto}` });
};

// Planes VIP que se ofrecen (públicos: también se muestran en la portada)
const planesVip = () => prisma.plan.findMany({
  where: { tipo: 'personal', estado: 'activo' },
  select: {
    id: true, nombre: true, descripcion: true, precio_mensual: true, lavados_incluidos: true,
    modalidad: true, descuento_pct: true, dias_anticipacion: true
  },
  orderBy: { precio_mensual: 'asc' }
});

const publicos = async (req, res) => {
  try {
    res.json({ success: true, data: await planesVip() });
  } catch (e) {
    responderError(res, e, 'al listar los planes VIP');
  }
};

// Suscripción personal activa del cliente logueado, con su estado del mes
const suscripcionDe = async (idCliente) => {
  const s = await prisma.suscripcion.findFirst({
    where: { id_cliente: idCliente, estado: 'activa' },
    include: { ...planController.incluirSuscripcion, pagos: { orderBy: { periodo: 'desc' }, take: 12 } }
  });
  return s ? planController.conEstado(s) : null;
};

/**
 * GET /api/mi-plan — todo lo que la pantalla necesita: el plan (si tiene),
 * si el mes está pagado, lavados usados y restantes, sus cobros, los planes
 * para elegir y hasta cuántos días adelante puede reservar hoy.
 */
const miPlan = async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({ where: { id: req.usuario.id_cliente } });
    const suscripcion = cliente?.tipo === 'persona' ? await suscripcionDe(cliente.id) : null;
    // La anticipación es la de hoy: con el mes en curso pagado
    const vigente = cliente?.tipo === 'persona' ? await beneficios.planPersonalVigente(cliente.id, fechas.hoy()) : null;
    res.json({
      success: true,
      data: {
        es_empresa: cliente?.tipo === 'empresa',
        suscripcion,
        restantes: suscripcion ? Math.max(suscripcion.plan.lavados_incluidos - suscripcion.uso_mes_actual, 0) : 0,
        dias_anticipacion: await beneficios.diasAnticipacion(vigente),
        planes: await planesVip()
      }
    });
  } catch (e) {
    responderError(res, e, 'al obtener su plan');
  }
};

// POST /api/mi-plan { id_plan } — se suscribe; queda el cobro del mes por pagar
const suscribirme = async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: parseInt(req.body?.id_plan) || 0 } });
    if (!plan) return res.status(400).json({ success: false, message: 'Plan inexistente' });
    await planController.suscribirPersona(req.usuario.id_cliente, plan);
    res.status(201).json({
      success: true,
      data: await suscripcionDe(req.usuario.id_cliente),
      message: 'Listo: transfiera el valor del mes y suba el comprobante para activar sus beneficios'
    });
  } catch (e) {
    responderError(res, e, 'al suscribirse');
  }
};

/**
 * POST /api/mi-plan/pagos/:id/comprobante (multipart, campo "comprobante")
 * El cobro queda en verificación hasta que un operador lo apruebe.
 */
const subirComprobante = async (req, res) => {
  try {
    const pago = await prisma.pagoSuscripcion.findUnique({
      where: { id: parseInt(req.params.id) || 0 },
      include: { suscripcion: true }
    });
    // Un cobro ajeno responde igual que uno inexistente
    if (!pago || pago.suscripcion.id_cliente !== req.usuario.id_cliente) {
      return res.status(404).json({ success: false, message: 'Cobro no encontrado' });
    }
    if (!['pendiente', 'rechazado'].includes(pago.estado)) {
      return res.status(409).json({ success: false, message: `Este cobro está "${pago.estado}"` });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Adjunte la imagen o el PDF del comprobante' });
    const actualizado = await prisma.pagoSuscripcion.update({
      where: { id: pago.id },
      data: {
        estado: 'en_verificacion',
        comprobante_url: `/uploads/comprobantes/plan-pago-${pago.id}/${req.file.filename}`,
        referencia: req.body?.referencia?.trim() || null,
        motivo_rechazo: null
      }
    });
    res.json({ success: true, data: actualizado, message: 'Comprobante recibido: lo verificamos y le avisamos' });
  } catch (e) {
    responderError(res, e, 'al subir el comprobante');
  }
};

/**
 * PUT /api/mi-plan/cancelar — deja de renovarse. Lo ya pagado del mes en
 * curso se mantiene: los beneficios siguen hasta fin de mes porque el cobro
 * aprobado sigue ahí; el mes siguiente ya no se genera.
 */
const cancelar = async (req, res) => {
  try {
    const s = await prisma.suscripcion.findFirst({ where: { id_cliente: req.usuario.id_cliente, estado: 'activa' } });
    if (!s) return res.status(404).json({ success: false, message: 'No tiene un plan activo' });
    await prisma.suscripcion.update({ where: { id: s.id }, data: { estado: 'cancelada', fecha_cancelacion: new Date() } });
    res.json({ success: true, message: 'Plan cancelado' });
  } catch (e) {
    responderError(res, e, 'al cancelar el plan');
  }
};

module.exports = { publicos, miPlan, suscribirme, subirComprobante, cancelar };
