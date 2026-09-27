/**
 * Controlador de catálogos auxiliares - Total Clean Car
 *
 * - Tipos de vehículo (moto, liviano, SUV...): definen qué servicios y a qué
 *   precio puede contratar cada vehículo.
 * - Servicios adicionales (encerado, aromatizante...): extras que se suman al
 *   servicio principal, como la confitería en la compra de una entrada de cine.
 *
 * Ninguno se borra: se desactiva, para no romper reservas ni vehículos que ya
 * los usan.
 */

const prisma = require('../db');

const error400 = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 400 });

const responderError = (res, error, mensaje) => {
  if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
  if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Ya existe un registro con ese código' });
  if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Registro no encontrado' });
  console.error(`${mensaje}:`, error);
  res.status(500).json({ success: false, message: mensaje });
};

// "Camioneta 4x4" -> "camioneta-4x4"
const aCodigo = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ==================== TIPOS DE VEHÍCULO ====================

const listarTiposVehiculo = async (req, res) => {
  try {
    const where = req.query.activo !== undefined ? { activo: req.query.activo === 'true' } : {};
    const tipos = await prisma.tipoVehiculo.findMany({
      where,
      include: { _count: { select: { vehiculos: true } } },
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: tipos });
  } catch (error) {
    responderError(res, error, 'Error al listar tipos de vehículo');
  }
};

const datosTipoVehiculo = (body, parcial) => {
  const { nombre, descripcion, orden_display, activo } = body;
  if (!parcial && !nombre?.trim()) throw error400('El nombre es obligatorio');
  return {
    ...(nombre?.trim() && { nombre: nombre.trim() }),
    ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
    ...(orden_display !== undefined && { orden_display: parseInt(orden_display) || 0 }),
    ...(activo !== undefined && { activo: !!activo })
  };
};

const crearTipoVehiculo = async (req, res) => {
  try {
    const data = datosTipoVehiculo(req.body, false);
    const codigo = aCodigo(req.body.codigo || data.nombre);
    if (!codigo) throw error400('Código inválido');
    const tipo = await prisma.tipoVehiculo.create({ data: { ...data, codigo, orden_display: data.orden_display ?? 99 } });
    res.status(201).json({ success: true, data: tipo });
  } catch (error) {
    responderError(res, error, 'Error al crear tipo de vehículo');
  }
};

const actualizarTipoVehiculo = async (req, res) => {
  try {
    const tipo = await prisma.tipoVehiculo.update({
      where: { id: parseInt(req.params.id) },
      data: datosTipoVehiculo(req.body, true)
    });
    res.json({ success: true, data: tipo });
  } catch (error) {
    responderError(res, error, 'Error al actualizar tipo de vehículo');
  }
};

// ==================== SERVICIOS ADICIONALES ====================

const listarAdicionales = async (req, res) => {
  try {
    const where = req.query.activo !== undefined ? { activo: req.query.activo === 'true' } : {};
    const adicionales = await prisma.servicioAdicional.findMany({ where, orderBy: { orden_display: 'asc' } });
    res.json({ success: true, data: adicionales });
  } catch (error) {
    responderError(res, error, 'Error al listar adicionales');
  }
};

const datosAdicional = (body, parcial) => {
  const { nombre, descripcion, precio, duracion_min, orden_display, activo } = body;
  if (!parcial && !nombre?.trim()) throw error400('El nombre es obligatorio');
  if (!parcial && precio === undefined) throw error400('El precio es obligatorio');
  if (precio !== undefined && !(parseFloat(precio) >= 0)) throw error400('El precio debe ser mayor o igual a 0');
  if (duracion_min !== undefined && !(parseInt(duracion_min) >= 0)) throw error400('La duración debe ser mayor o igual a 0');
  return {
    ...(nombre?.trim() && { nombre: nombre.trim() }),
    ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
    ...(precio !== undefined && { precio: parseFloat(precio) }),
    ...(duracion_min !== undefined && { duracion_min: parseInt(duracion_min) }),
    ...(orden_display !== undefined && { orden_display: parseInt(orden_display) || 0 }),
    ...(activo !== undefined && { activo: !!activo })
  };
};

const crearAdicional = async (req, res) => {
  try {
    const data = datosAdicional(req.body, false);
    const adicional = await prisma.servicioAdicional.create({ data: { orden_display: 99, ...data } });
    res.status(201).json({ success: true, data: adicional });
  } catch (error) {
    responderError(res, error, 'Error al crear adicional');
  }
};

const actualizarAdicional = async (req, res) => {
  try {
    const adicional = await prisma.servicioAdicional.update({
      where: { id: parseInt(req.params.id) },
      data: datosAdicional(req.body, true)
    });
    res.json({ success: true, data: adicional });
  } catch (error) {
    responderError(res, error, 'Error al actualizar adicional');
  }
};

module.exports = {
  listarTiposVehiculo, crearTipoVehiculo, actualizarTipoVehiculo,
  listarAdicionales, crearAdicional, actualizarAdicional
};
