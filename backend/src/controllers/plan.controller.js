/**
 * Controlador de Planes y Suscripciones - Total Clean Car
 *
 * Dos clases de plan (Plan.tipo, ver services/beneficios.service.js):
 *   sitio     lo contrata un edificio/condominio: N lavados al mes compartidos
 *             entre los residentes que reservan ahí.
 *   personal  el VIP: lo contrata una persona y se paga cada mes. Da lavados
 *             incluidos, descuento y prioridad de horario, solo en los meses
 *             pagados (PagoSuscripcion aprobado).
 *
 * El cobro mensual del VIP sigue el mismo circuito que el pago de una reserva:
 * se genera el cobro del mes, el cliente sube el comprobante y un operador lo
 * aprueba (o el panel lo registra directo). La parte del cliente ("Mi plan")
 * está en vip.controller.js.
 */

const prisma = require('../db');
const alcance = require('../utils/alcance');
const fechas = require('../utils/fechas');
const { firmar } = require('../utils/firmaArchivos');
const beneficios = require('../services/beneficios.service');

const responderError = (res, error, contexto) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  console.error(`Error ${contexto}:`, error);
  res.status(500).json({ success: false, message: `Error ${contexto}` });
};
const error = (statusCode, mensaje) => Object.assign(new Error(mensaje), { statusCode });

const MODALIDADES = ['expreso', 'profunda', 'todas'];
const TIPOS = ['sitio', 'personal'];
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

// ==================== PLANES ====================

const listarPlanes = async (req, res) => {
  try {
    const { estado, tipo } = req.query;
    const planes = await prisma.plan.findMany({
      where: { ...(estado && { estado }), ...(tipo && { tipo }) },
      orderBy: [{ tipo: 'asc' }, { precio_mensual: 'asc' }]
    });
    res.json({ success: true, data: planes });
  } catch (e) {
    responderError(res, e, 'al listar planes');
  }
};

// Campos del plan validados; `parcial` para editar (solo lo que viene)
const datosPlan = (body, parcial = false) => {
  const d = {};
  if (!parcial || body.nombre !== undefined) {
    if (!body.nombre?.trim()) throw error(400, 'El nombre es obligatorio');
    d.nombre = body.nombre.trim();
  }
  if (body.descripcion !== undefined) d.descripcion = body.descripcion?.trim() || null;
  if (!parcial || body.tipo !== undefined) {
    const tipo = body.tipo || 'sitio';
    if (!TIPOS.includes(tipo)) throw error(400, 'Tipo inválido (sitio | personal)');
    d.tipo = tipo;
  }
  if (!parcial || body.precio_mensual !== undefined) {
    const p = Number(body.precio_mensual);
    if (!(p > 0)) throw error(400, 'El precio mensual debe ser mayor a cero');
    d.precio_mensual = p;
  }
  if (!parcial || body.lavados_incluidos !== undefined) {
    const n = parseInt(body.lavados_incluidos);
    // Un VIP puede ser solo descuento y prioridad (0 lavados incluidos)
    if (!(n >= 0)) throw error(400, 'Lavados incluidos inválido');
    d.lavados_incluidos = n;
  }
  if (!parcial || body.modalidad !== undefined) {
    const m = body.modalidad || 'expreso';
    if (!MODALIDADES.includes(m)) throw error(400, 'Modalidad inválida (expreso | profunda | todas)');
    d.modalidad = m;
  }
  if (body.descuento_pct !== undefined) {
    const n = Number(body.descuento_pct);
    if (!(n >= 0 && n <= 100)) throw error(400, 'El descuento es un porcentaje de 0 a 100');
    d.descuento_pct = n;
  }
  if (body.dias_anticipacion !== undefined) {
    const vacio = body.dias_anticipacion === null || body.dias_anticipacion === '';
    const n = parseInt(body.dias_anticipacion);
    if (!vacio && !(n >= 1 && n <= 365)) throw error(400, 'Días de anticipación inválidos (1 a 365)');
    d.dias_anticipacion = vacio ? null : n;
  }
  if (body.estado !== undefined) {
    if (!['activo', 'inactivo'].includes(body.estado)) throw error(400, 'Estado inválido');
    d.estado = body.estado;
  }
  return d;
};

const crearPlan = async (req, res) => {
  try {
    const plan = await prisma.plan.create({ data: datosPlan(req.body) });
    res.status(201).json({ success: true, data: plan });
  } catch (e) {
    responderError(res, e, 'al crear el plan');
  }
};

const actualizarPlan = async (req, res) => {
  try {
    const actual = await prisma.plan.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!actual) return res.status(404).json({ success: false, message: 'Plan no encontrado' });
    const datos = datosPlan(req.body, true);
    if (datos.tipo && datos.tipo !== actual.tipo) {
      const usadas = await prisma.suscripcion.count({ where: { id_plan: actual.id } });
      if (usadas > 0) throw error(400, 'No se puede cambiar el tipo de un plan que ya tiene suscripciones');
    }
    const plan = await prisma.plan.update({ where: { id: actual.id }, data: datos });
    res.json({ success: true, data: plan });
  } catch (e) {
    responderError(res, e, 'al actualizar el plan');
  }
};

// ==================== SUSCRIPCIONES ====================

const hoy = () => fechas.hoy();

// Uso del mes en curso, y si el mes en curso está pagado (para las personales)
const conEstado = async (s) => {
  const periodo = beneficios.periodoDe(hoy());
  const pagoMes = s.pagos?.find((p) => p.periodo === periodo) || null;
  return {
    ...s,
    pagos: s.pagos?.map((p) => ({ ...p, comprobante_url: firmar(p.comprobante_url) })),
    uso_mes_actual: await beneficios.usoDelMes(s.id, hoy()),
    ...(s.plan.tipo === 'personal' && {
      pago_mes_actual: pagoMes && { ...pagoMes, comprobante_url: firmar(pagoMes.comprobante_url) },
      vigente: pagoMes?.estado === 'aprobado'
    })
  };
};

const incluirSuscripcion = {
  plan: true,
  estacionamiento: { select: { id: true, nombre: true, ciudad: { select: { id: true, nombre: true } } } },
  cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
  pagos: { orderBy: { periodo: 'desc' }, take: 6 }
};

const listarSuscripciones = async (req, res) => {
  try {
    // Las personales son de todo el país: el operador de ciudad ve solo las de sus sitios
    const ciudad = alcance.ciudadFiltro(req);
    const fija = alcance.ciudadFija(req.usuario);
    const suscripciones = await prisma.suscripcion.findMany({
      where: {
        estado: 'activa',
        ...(ciudad && (fija
          ? { estacionamiento: { is: { id_ciudad: ciudad } } }
          : { OR: [{ estacionamiento: { is: { id_ciudad: ciudad } } }, { id_cliente: { not: null } }] }))
      },
      include: incluirSuscripcion,
      orderBy: { fecha_inicio: 'desc' }
    });
    res.json({ success: true, data: await Promise.all(suscripciones.map(conEstado)) });
  } catch (e) {
    responderError(res, e, 'al listar suscripciones');
  }
};

/**
 * Suscribe a una persona a un plan personal y genera el cobro del mes en
 * curso. Una persona tiene un solo plan VIP activo a la vez. Lo usan el panel
 * y el propio cliente (vip.controller.js).
 */
const suscribirPersona = async (idCliente, plan) => {
  const cliente = idCliente && await prisma.cliente.findUnique({ where: { id: idCliente } });
  if (!cliente || cliente.estado !== 'activo') throw error(400, 'Cliente inexistente o suspendido');
  if (cliente.tipo !== 'persona') throw error(400, 'Los planes VIP son para personas; las empresas tienen tarifas pactadas');
  if (plan.tipo !== 'personal' || plan.estado !== 'activo') throw error(400, 'Plan VIP inválido o inactivo');
  const existente = await prisma.suscripcion.findFirst({ where: { id_cliente: cliente.id, estado: 'activa' } });
  if (existente) throw error(409, 'Ya tiene un plan VIP activo: cancélelo antes de cambiar de plan');
  return prisma.suscripcion.create({
    data: {
      id_cliente: cliente.id,
      id_plan: plan.id,
      pagos: { create: { periodo: beneficios.periodoDe(hoy()), monto: plan.precio_mensual } }
    },
    include: incluirSuscripcion
  });
};

/**
 * Alta de una suscripción. De sitio: { id_estacionamiento, id_plan }.
 * Personal: { id_cliente, id_plan } — se genera el cobro del mes en curso, y
 * los beneficios empiezan cuando se apruebe.
 */
const crearSuscripcion = async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: parseInt(req.body.id_plan) || 0 } });
    if (!plan || plan.estado !== 'activo') throw error(400, 'Plan inválido o inactivo');

    if (plan.tipo === 'personal') {
      if (!alcance.esNacional(req.usuario)) return alcance.fueraDeAlcance(res);
      const s = await suscribirPersona(parseInt(req.body.id_cliente), plan);
      return res.status(201).json({ success: true, data: await conEstado(s) });
    }

    const idSitio = parseInt(req.body.id_estacionamiento);
    if (!idSitio) throw error(400, 'Estacionamiento y plan son obligatorios');
    const sitio = await prisma.estacionamiento.findUnique({ where: { id: idSitio } });
    if (!sitio) throw error(400, 'Estacionamiento inexistente');
    if (!alcance.puedeVer(req.usuario, sitio.id_ciudad)) return alcance.fueraDeAlcance(res);
    if (sitio.tipo !== 'aliado') {
      throw error(400, 'Los planes de sitio son para sitios aliados (edificios, condominios), no para talleres ni parqueaderos privados');
    }
    const existente = await prisma.suscripcion.findFirst({ where: { id_estacionamiento: idSitio, estado: 'activa' } });
    if (existente) throw error(409, 'Este estacionamiento ya tiene una suscripción activa; cancélela antes de asignar otra');

    const suscripcion = await prisma.suscripcion.create({
      data: { id_estacionamiento: idSitio, id_plan: plan.id },
      include: incluirSuscripcion
    });
    res.status(201).json({ success: true, data: await conEstado(suscripcion) });
  } catch (e) {
    responderError(res, e, 'al crear la suscripción');
  }
};

const cancelarSuscripcion = async (req, res) => {
  try {
    const actual = await prisma.suscripcion.findUnique({
      where: { id: parseInt(req.params.id) || 0 },
      include: { estacionamiento: { select: { id_ciudad: true } } }
    });
    if (!actual) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' });
    const permitido = actual.estacionamiento
      ? alcance.puedeVer(req.usuario, actual.estacionamiento.id_ciudad)
      : alcance.esNacional(req.usuario);
    if (!permitido) return alcance.fueraDeAlcance(res);
    const suscripcion = await prisma.suscripcion.update({
      where: { id: actual.id },
      data: { estado: 'cancelada', fecha_cancelacion: new Date() }
    });
    res.json({ success: true, data: suscripcion });
  } catch (e) {
    responderError(res, e, 'al cancelar la suscripción');
  }
};

// ==================== COBROS MENSUALES VIP ====================

/**
 * POST /api/planes/cobros { periodo } — genera el cobro del mes para cada
 * suscripción personal activa que todavía no lo tenga. Se puede correr varias
 * veces: no duplica (único por suscripción y mes).
 */
const generarCobros = async (req, res) => {
  try {
    const periodo = req.body?.periodo || beneficios.periodoDe(hoy());
    if (!PERIODO.test(periodo)) throw error(400, 'Período inválido (AAAA-MM)');
    const activas = await prisma.suscripcion.findMany({
      where: { estado: 'activa', id_cliente: { not: null }, plan: { tipo: 'personal' }, pagos: { none: { periodo } } },
      include: { plan: true }
    });
    if (activas.length) {
      await prisma.pagoSuscripcion.createMany({
        data: activas.map((s) => ({ id_suscripcion: s.id, periodo, monto: s.plan.precio_mensual })),
        skipDuplicates: true
      });
    }
    res.json({ success: true, data: { periodo, generados: activas.length }, message: `${activas.length} cobro(s) generado(s)` });
  } catch (e) {
    responderError(res, e, 'al generar los cobros');
  }
};

// GET /api/planes/pagos?estado=en_verificacion — bandeja de comprobantes de planes
const listarPagos = async (req, res) => {
  try {
    const pagos = await prisma.pagoSuscripcion.findMany({
      where: req.query.estado ? { estado: req.query.estado } : {},
      include: { suscripcion: { include: { plan: true, cliente: { select: { id: true, nombre: true, email: true, telefono: true } } } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, data: pagos.map((p) => ({ ...p, comprobante_url: firmar(p.comprobante_url) })) });
  } catch (e) {
    responderError(res, e, 'al listar los pagos de planes');
  }
};

// PUT /api/planes/pagos/:id/verificar { aprobar, motivo }
const verificarPago = async (req, res) => {
  try {
    const { aprobar, motivo } = req.body || {};
    if (typeof aprobar !== 'boolean') throw error(400, 'Indique si aprueba o rechaza (aprobar: true|false)');
    const pago = await prisma.pagoSuscripcion.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!pago) return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    if (pago.estado !== 'en_verificacion') throw error(400, `Este pago está "${pago.estado}"`);
    if (!aprobar && !motivo?.trim()) throw error(400, 'Indique el motivo del rechazo (lo verá el cliente)');
    const actualizado = await prisma.pagoSuscripcion.update({
      where: { id: pago.id },
      data: aprobar
        ? { estado: 'aprobado', fecha_pago: new Date(), motivo_rechazo: null }
        : { estado: 'rechazado', motivo_rechazo: motivo.trim() }
    });
    res.json({ success: true, data: actualizado, message: aprobar ? 'Pago aprobado: el plan rige ese mes' : 'Comprobante rechazado' });
  } catch (e) {
    responderError(res, e, 'al verificar el pago del plan');
  }
};

/**
 * POST /api/planes/suscripciones/:id/pagos { periodo, metodo, referencia }
 * Pago recibido por el panel (efectivo o transferencia ya vista): queda aprobado.
 */
const registrarPago = async (req, res) => {
  try {
    const s = await prisma.suscripcion.findUnique({ where: { id: parseInt(req.params.id) || 0 }, include: { plan: true } });
    if (!s || !s.id_cliente) return res.status(404).json({ success: false, message: 'Suscripción personal no encontrada' });
    if (s.estado !== 'activa') throw error(400, 'La suscripción está cancelada');
    const periodo = req.body?.periodo || beneficios.periodoDe(hoy());
    if (!PERIODO.test(periodo)) throw error(400, 'Período inválido (AAAA-MM)');
    const metodo = req.body?.metodo === 'efectivo' ? 'efectivo' : 'transferencia';
    const datos = {
      estado: 'aprobado', metodo, fecha_pago: new Date(), monto: s.plan.precio_mensual,
      referencia: req.body?.referencia?.trim() || null, motivo_rechazo: null
    };
    const actual = await prisma.pagoSuscripcion.findUnique({
      where: { id_suscripcion_periodo: { id_suscripcion: s.id, periodo } }
    });
    if (actual?.estado === 'aprobado') throw error(409, 'Ese mes ya está pagado');
    const pago = actual
      ? await prisma.pagoSuscripcion.update({ where: { id: actual.id }, data: datos })
      : await prisma.pagoSuscripcion.create({ data: { id_suscripcion: s.id, periodo, ...datos } });
    res.status(201).json({ success: true, data: pago, message: 'Pago registrado' });
  } catch (e) {
    responderError(res, e, 'al registrar el pago del plan');
  }
};

module.exports = {
  listarPlanes, crearPlan, actualizarPlan,
  listarSuscripciones, crearSuscripcion, cancelarSuscripcion, suscribirPersona, conEstado, incluirSuscripcion,
  generarCobros, listarPagos, verificarPago, registrarPago
};
