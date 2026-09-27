/**
 * Controlador de Planes y Suscripciones - Total Clean Car
 * Un Plan se contrata para un Estacionamiento (edificio/condominio): cubre N lavados
 * expreso al mes, compartidos entre todos los residentes que reservan en ese sitio.
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');

// Mismo criterio que crear reserva: el mes se cuenta sobre `Reserva.fecha`
const inicioMesActual = () => fechas.inicioMes(fechas.hoy());

// ==================== PLANES ====================

const listarPlanes = async (req, res) => {
  try {
    const { estado } = req.query;
    const planes = await prisma.plan.findMany({
      where: estado ? { estado } : {},
      orderBy: { precio_mensual: 'asc' }
    });
    res.json({ success: true, data: planes });
  } catch (error) {
    console.error('Error listando planes:', error);
    res.status(500).json({ success: false, message: 'Error al listar planes' });
  }
};

const crearPlan = async (req, res) => {
  try {
    const { nombre, descripcion, precio_mensual, lavados_incluidos, modalidad } = req.body;
    if (!nombre || !precio_mensual || !lavados_incluidos) {
      return res.status(400).json({ success: false, message: 'Nombre, precio mensual y lavados incluidos son obligatorios' });
    }
    const plan = await prisma.plan.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        precio_mensual: parseFloat(precio_mensual),
        lavados_incluidos: parseInt(lavados_incluidos),
        modalidad: modalidad === 'profunda' ? 'profunda' : 'expreso'
      }
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error('Error creando plan:', error);
    res.status(500).json({ success: false, message: 'Error al crear el plan' });
  }
};

const actualizarPlan = async (req, res) => {
  try {
    const { nombre, descripcion, precio_mensual, lavados_incluidos, modalidad, estado } = req.body;
    const plan = await prisma.plan.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
        ...(precio_mensual !== undefined && { precio_mensual: parseFloat(precio_mensual) }),
        ...(lavados_incluidos !== undefined && { lavados_incluidos: parseInt(lavados_incluidos) }),
        ...(modalidad && { modalidad }),
        ...(estado && { estado })
      }
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Error actualizando plan:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el plan' });
  }
};

// ==================== SUSCRIPCIONES ====================

// Uso del mes actual: reservas no canceladas que consumieron cupo de esa suscripción
const contarUsoMes = async (id_suscripcion) => {
  return prisma.reserva.count({
    where: { id_suscripcion, estado: { not: 'cancelada' }, fecha: { gte: inicioMesActual() } }
  });
};

const listarSuscripciones = async (req, res) => {
  try {
    const suscripciones = await prisma.suscripcion.findMany({
      where: { estado: 'activa' },
      include: { plan: true, estacionamiento: { select: { id: true, nombre: true } } },
      orderBy: { fecha_inicio: 'desc' }
    });
    const conUso = await Promise.all(
      suscripciones.map(async (s) => ({ ...s, uso_mes_actual: await contarUsoMes(s.id) }))
    );
    res.json({ success: true, data: conUso });
  } catch (error) {
    console.error('Error listando suscripciones:', error);
    res.status(500).json({ success: false, message: 'Error al listar suscripciones' });
  }
};

const crearSuscripcion = async (req, res) => {
  try {
    const { id_estacionamiento, id_plan } = req.body;
    if (!id_estacionamiento || !id_plan) {
      return res.status(400).json({ success: false, message: 'Estacionamiento y plan son obligatorios' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: parseInt(id_plan) } });
    if (!plan || plan.estado !== 'activo') {
      return res.status(400).json({ success: false, message: 'Plan inválido o inactivo' });
    }

    const existente = await prisma.suscripcion.findFirst({
      where: { id_estacionamiento: parseInt(id_estacionamiento), estado: 'activa' }
    });
    if (existente) {
      return res.status(409).json({ success: false, message: 'Este estacionamiento ya tiene una suscripción activa; cancélela antes de asignar otra' });
    }

    const suscripcion = await prisma.suscripcion.create({
      data: { id_estacionamiento: parseInt(id_estacionamiento), id_plan: parseInt(id_plan) },
      include: { plan: true, estacionamiento: { select: { id: true, nombre: true } } }
    });
    res.status(201).json({ success: true, data: suscripcion });
  } catch (error) {
    console.error('Error creando suscripción:', error);
    res.status(500).json({ success: false, message: 'Error al crear la suscripción' });
  }
};

const cancelarSuscripcion = async (req, res) => {
  try {
    const suscripcion = await prisma.suscripcion.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'cancelada', fecha_cancelacion: new Date() }
    });
    res.json({ success: true, data: suscripcion });
  } catch (error) {
    console.error('Error cancelando suscripción:', error);
    res.status(500).json({ success: false, message: 'Error al cancelar la suscripción' });
  }
};

module.exports = {
  listarPlanes, crearPlan, actualizarPlan,
  listarSuscripciones, crearSuscripcion, cancelarSuscripcion,
  contarUsoMes
};
