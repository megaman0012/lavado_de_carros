/**
 * Controlador de Tipos de Servicio - Total Clean Car
 *
 * Cada servicio tiene una tabla de precios: una fila por tipo de vehículo con
 * su precio y su duración (PrecioServicio). Como la cartelera de un cine, donde
 * la misma película cuesta distinto en sala 2D, 3D o IMAX. Si un tipo no tiene
 * fila activa, ese servicio no se le ofrece (ej. "Limpieza profunda" para motos).
 */

const prisma = require('../db');

const incluirPrecios = {
  precios: {
    include: { tipoVehiculo: { select: { id: true, codigo: true, nombre: true, activo: true } } },
    orderBy: { tipoVehiculo: { orden_display: 'asc' } }
  }
};

const error400 = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 400 });

// Valida la tabla de precios que llega del formulario:
// [{ id_tipo_vehiculo, precio, duracion_min, activo }]
const normalizarPrecios = async (precios) => {
  if (precios === undefined) return undefined;
  if (!Array.isArray(precios)) throw error400('precios debe ser una lista');

  const filas = precios.map((p) => ({
    id_tipo_vehiculo: parseInt(p.id_tipo_vehiculo),
    precio: parseFloat(p.precio),
    duracion_min: parseInt(p.duracion_min),
    activo: p.activo !== false
  }));
  for (const f of filas) {
    if (!Number.isInteger(f.id_tipo_vehiculo)) throw error400('Tipo de vehículo inválido en la tabla de precios');
    if (!(f.precio >= 0)) throw error400('El precio debe ser un número mayor o igual a 0');
    if (!(f.duracion_min >= 5)) throw error400('La duración debe ser de al menos 5 minutos');
  }
  const ids = filas.map((f) => f.id_tipo_vehiculo);
  if (new Set(ids).size !== ids.length) throw error400('Un tipo de vehículo aparece dos veces en la tabla de precios');
  const existentes = await prisma.tipoVehiculo.count({ where: { id: { in: ids } } });
  if (existentes !== ids.length) throw error400('Algún tipo de vehículo de la tabla de precios no existe');
  return filas;
};

// Reemplaza la tabla de precios del servicio. Los tipos que ya no vienen se
// desactivan (no se borran: una fila desactivada conserva el último precio).
const guardarPrecios = async (tx, idServicio, filas) => {
  for (const f of filas) {
    await tx.precioServicio.upsert({
      where: { id_tipo_servicio_id_tipo_vehiculo: { id_tipo_servicio: idServicio, id_tipo_vehiculo: f.id_tipo_vehiculo } },
      create: { id_tipo_servicio: idServicio, ...f },
      update: { precio: f.precio, duracion_min: f.duracion_min, activo: f.activo }
    });
  }
  await tx.precioServicio.updateMany({
    where: { id_tipo_servicio: idServicio, id_tipo_vehiculo: { notIn: filas.map((f) => f.id_tipo_vehiculo) } },
    data: { activo: false }
  });
};

const responderError = (res, error, mensaje) => {
  if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
  console.error(`${mensaje}:`, error);
  res.status(500).json({ success: false, message: mensaje });
};

const listar = async (req, res) => {
  try {
    const { modalidad, activo } = req.query;
    const where = {};
    if (modalidad) where.modalidad = modalidad;
    if (activo !== undefined) where.activo = activo === 'true';

    const servicios = await prisma.tipoServicio.findMany({
      where,
      include: incluirPrecios,
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: servicios });
  } catch (error) {
    responderError(res, error, 'Error al listar servicios');
  }
};

const obtener = async (req, res) => {
  try {
    const servicio = await prisma.tipoServicio.findUnique({ where: { id: parseInt(req.params.id) }, include: incluirPrecios });
    if (!servicio) return res.status(404).json({ success: false, message: 'Servicio no encontrado' });
    res.json({ success: true, data: servicio });
  } catch (error) {
    responderError(res, error, 'Error al obtener servicio');
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, descripcion, modalidad, orden_display, precios } = req.body;
    if (!nombre || !modalidad) {
      return res.status(400).json({ success: false, message: 'Nombre y modalidad son obligatorios' });
    }
    if (!['expreso', 'profunda'].includes(modalidad)) {
      return res.status(400).json({ success: false, message: 'Modalidad inválida (expreso | profunda)' });
    }
    const filas = await normalizarPrecios(precios);
    if (!filas || filas.filter((f) => f.activo).length === 0) {
      return res.status(400).json({ success: false, message: 'Indique el precio para al menos un tipo de vehículo' });
    }

    const servicio = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.tipoServicio.create({
        data: {
          nombre: nombre.trim(),
          descripcion: descripcion?.trim() || null,
          modalidad,
          orden_display: parseInt(orden_display) || 99
        }
      });
      await guardarPrecios(tx, nuevo.id, filas);
      return tx.tipoServicio.findUnique({ where: { id: nuevo.id }, include: incluirPrecios });
    });
    res.status(201).json({ success: true, data: servicio });
  } catch (error) {
    responderError(res, error, 'Error al crear servicio');
  }
};

const actualizar = async (req, res) => {
  try {
    const { nombre, descripcion, modalidad, orden_display, activo, precios } = req.body;
    if (modalidad && !['expreso', 'profunda'].includes(modalidad)) {
      return res.status(400).json({ success: false, message: 'Modalidad inválida (expreso | profunda)' });
    }
    const filas = await normalizarPrecios(precios);
    if (filas && filas.filter((f) => f.activo).length === 0) {
      return res.status(400).json({ success: false, message: 'Indique el precio para al menos un tipo de vehículo' });
    }
    const id = parseInt(req.params.id);

    const servicio = await prisma.$transaction(async (tx) => {
      await tx.tipoServicio.update({
        where: { id },
        data: {
          ...(nombre && { nombre: nombre.trim() }),
          ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
          ...(modalidad && { modalidad }),
          ...(orden_display !== undefined && { orden_display: parseInt(orden_display) }),
          ...(activo !== undefined && { activo })
        }
      });
      if (filas) await guardarPrecios(tx, id, filas);
      return tx.tipoServicio.findUnique({ where: { id }, include: incluirPrecios });
    });
    res.json({ success: true, data: servicio });
  } catch (error) {
    responderError(res, error, 'Error al actualizar servicio');
  }
};

const eliminar = async (req, res) => {
  try {
    await prisma.tipoServicio.update({
      where: { id: parseInt(req.params.id) },
      data: { activo: false }
    });
    res.json({ success: true, message: 'Servicio desactivado' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar servicio');
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
