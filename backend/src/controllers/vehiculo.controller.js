/**
 * Controlador de Vehículos - Sistema de Lavado de Carros
 */

const prisma = require('../db');

const listar = async (req, res) => {
  try {
    const { id_cliente, estado } = req.query;
    const where = {};
    if (id_cliente) where.id_cliente = parseInt(id_cliente);
    if (estado) where.estado = estado;

    // Un cliente solo ve sus propios vehículos
    if (req.usuario.rol === 'cliente') where.id_cliente = req.usuario.id_cliente;

    const vehiculos = await prisma.vehiculo.findMany({
      where,
      include: { cliente: { select: { id: true, nombre: true } } },
      orderBy: { placa: 'asc' }
    });
    res.json({ success: true, data: vehiculos });
  } catch (error) {
    console.error('Error listando vehículos:', error);
    res.status(500).json({ success: false, message: 'Error al listar vehículos' });
  }
};

const crear = async (req, res) => {
  try {
    let { id_cliente, placa, marca, modelo, color, tipo } = req.body;
    if (req.usuario.rol === 'cliente') id_cliente = req.usuario.id_cliente;

    if (!id_cliente || !placa) {
      return res.status(400).json({ success: false, message: 'Cliente y placa son obligatorios' });
    }

    const existe = await prisma.vehiculo.findUnique({ where: { placa: placa.toUpperCase().trim() } });
    if (existe) return res.status(409).json({ success: false, message: 'Ya existe un vehículo con esa placa' });

    const vehiculo = await prisma.vehiculo.create({
      data: {
        id_cliente: parseInt(id_cliente),
        placa: placa.toUpperCase().trim(),
        marca: marca?.trim() || null,
        modelo: modelo?.trim() || null,
        color: color?.trim() || null,
        tipo: tipo || null
      }
    });
    res.status(201).json({ success: true, data: vehiculo });
  } catch (error) {
    console.error('Error creando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al crear vehículo' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { marca, modelo, color, tipo, estado } = req.body;
    const vehiculo = await prisma.vehiculo.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(marca !== undefined && { marca: marca?.trim() || null }),
        ...(modelo !== undefined && { modelo: modelo?.trim() || null }),
        ...(color !== undefined && { color: color?.trim() || null }),
        ...(tipo !== undefined && { tipo: tipo || null }),
        ...(estado && { estado })
      }
    });
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar vehículo' });
  }
};

const eliminar = async (req, res) => {
  try {
    await prisma.vehiculo.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'inactivo' }
    });
    res.json({ success: true, message: 'Vehículo desactivado' });
  } catch (error) {
    console.error('Error eliminando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar vehículo' });
  }
};

module.exports = { listar, crear, actualizar, eliminar };
