/**
 * Controlador de Lavadores - Sistema de Lavado de Carros
 */

const prisma = require('../db');

const listar = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const lavadores = await prisma.lavador.findMany({
      where,
      include: { usuario: { select: { id: true, username: true } } },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: lavadores });
  } catch (error) {
    console.error('Error listando lavadores:', error);
    res.status(500).json({ success: false, message: 'Error al listar lavadores' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, cedula, telefono } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const lavador = await prisma.lavador.create({
      data: {
        nombre: nombre.trim(),
        cedula: cedula?.trim() || null,
        telefono: telefono?.trim() || null
      }
    });
    res.status(201).json({ success: true, data: lavador });
  } catch (error) {
    console.error('Error creando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al crear lavador' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { nombre, cedula, telefono, estado } = req.body;
    const lavador = await prisma.lavador.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(cedula !== undefined && { cedula: cedula?.trim() || null }),
        ...(telefono !== undefined && { telefono: telefono?.trim() || null }),
        ...(estado && { estado })
      }
    });
    res.json({ success: true, data: lavador });
  } catch (error) {
    console.error('Error actualizando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar lavador' });
  }
};

// Asignar/quitar lavador de una franja de agenda
const asignarLavador = async (req, res) => {
  try {
    const { id_lavador } = req.body;
    const asignacion = await prisma.asignacionAgenda.update({
      where: { id: parseInt(req.params.asignacionId) },
      data: { id_lavador: id_lavador ? parseInt(id_lavador) : null },
      include: { lavador: { select: { id: true, nombre: true } }, reserva: { select: { codigo: true } } }
    });
    res.json({ success: true, data: asignacion });
  } catch (error) {
    console.error('Error asignando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al asignar lavador' });
  }
};

module.exports = { listar, crear, actualizar, asignarLavador };
