/**
 * Controlador de Tipos de Servicio - Sistema de Lavado de Carros
 * Catálogo: 5 expresos + limpieza profunda (precios/duraciones configurables).
 */

const prisma = require('../db');

const listar = async (req, res) => {
  try {
    const { modalidad, activo } = req.query;
    const where = {};
    if (modalidad) where.modalidad = modalidad;
    if (activo !== undefined) where.activo = activo === 'true';

    const servicios = await prisma.tipoServicio.findMany({
      where,
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: servicios });
  } catch (error) {
    console.error('Error listando servicios:', error);
    res.status(500).json({ success: false, message: 'Error al listar servicios' });
  }
};

const obtener = async (req, res) => {
  try {
    const servicio = await prisma.tipoServicio.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!servicio) return res.status(404).json({ success: false, message: 'Servicio no encontrado' });
    res.json({ success: true, data: servicio });
  } catch (error) {
    console.error('Error obteniendo servicio:', error);
    res.status(500).json({ success: false, message: 'Error al obtener servicio' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, descripcion, modalidad, duracion_min, precio, orden_display } = req.body;
    if (!nombre || !modalidad) {
      return res.status(400).json({ success: false, message: 'Nombre y modalidad son obligatorios' });
    }
    if (!['expreso', 'profunda'].includes(modalidad)) {
      return res.status(400).json({ success: false, message: 'Modalidad inválida (expreso | profunda)' });
    }

    const servicio = await prisma.tipoServicio.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        modalidad,
        duracion_min: parseInt(duracion_min) || 60,
        precio: parseFloat(precio) || 0,
        orden_display: parseInt(orden_display) || 99
      }
    });
    res.status(201).json({ success: true, data: servicio });
  } catch (error) {
    console.error('Error creando servicio:', error);
    res.status(500).json({ success: false, message: 'Error al crear servicio' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { nombre, descripcion, modalidad, duracion_min, precio, orden_display, activo } = req.body;
    const servicio = await prisma.tipoServicio.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
        ...(modalidad && { modalidad }),
        ...(duracion_min && { duracion_min: parseInt(duracion_min) }),
        ...(precio !== undefined && { precio: parseFloat(precio) }),
        ...(orden_display !== undefined && { orden_display: parseInt(orden_display) }),
        ...(activo !== undefined && { activo })
      }
    });
    res.json({ success: true, data: servicio });
  } catch (error) {
    console.error('Error actualizando servicio:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar servicio' });
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
    console.error('Error eliminando servicio:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar servicio' });
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
