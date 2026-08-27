/**
 * Controlador de Clientes - Sistema de Lavado de Carros
 */

const prisma = require('../db');

const listar = async (req, res) => {
  try {
    const { estado, busqueda } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { email: { contains: busqueda, mode: 'insensitive' } },
        { cedula: { contains: busqueda } }
      ];
    }
    const clientes = await prisma.cliente.findMany({
      where,
      include: { vehiculos: true, usuario: { select: { id: true, username: true, rol: true } } },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: clientes });
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ success: false, message: 'Error al listar clientes' });
  }
};

const obtener = async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { vehiculos: true, reservas: true, usuario: { select: { id: true, username: true } } }
    });
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ success: false, message: 'Error al obtener cliente' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, cedula, telefono, email } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const cliente = await prisma.cliente.create({
      data: {
        nombre: nombre.trim(),
        cedula: cedula?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim().toLowerCase() || null
      }
    });
    res.status(201).json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al crear cliente' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { nombre, cedula, telefono, email, estado } = req.body;
    const cliente = await prisma.cliente.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(cedula !== undefined && { cedula: cedula?.trim() || null }),
        ...(telefono !== undefined && { telefono: telefono?.trim() || null }),
        ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
        ...(estado && { estado })
      }
    });
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar cliente' });
  }
};

const eliminar = async (req, res) => {
  try {
    await prisma.cliente.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'inactivo' }
    });
    res.json({ success: true, message: 'Cliente desactivado' });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar cliente' });
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
