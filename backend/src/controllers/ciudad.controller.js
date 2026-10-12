/**
 * Controlador de Ciudades - Total Clean Car
 *
 * Catálogo de las ciudades donde opera el servicio. Lo administra solo quien
 * tiene alcance nacional; cualquier usuario interno puede listarlas (las
 * necesita para los filtros y formularios).
 *
 * Una ciudad no se borra: tiene sitios, lavadores y reservas colgando. Se
 * desactiva, y entonces deja de ofrecerse al público y en los formularios.
 */

const prisma = require('../db');

const listar = async (req, res) => {
  try {
    const ciudades = await prisma.ciudad.findMany({
      include: { _count: { select: { estacionamientos: true, lavadores: true, usuarios: true } } },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: ciudades });
  } catch (error) {
    console.error('Error listando ciudades:', error);
    res.status(500).json({ success: false, message: 'Error al listar ciudades' });
  }
};

// "  guayaquil " → "Guayaquil": el texto libre de antes terminó con "Quito" y
// "GUAYAQUIL" conviviendo, que es justo lo que esta tabla vino a evitar.
const normalizar = (nombre) =>
  nombre.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

const crear = async (req, res) => {
  try {
    const { nombre, provincia } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const ciudad = await prisma.ciudad.create({
      data: { nombre: normalizar(nombre), provincia: provincia?.trim() || null }
    });
    res.status(201).json({ success: true, data: ciudad });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Esa ciudad ya existe' });
    }
    console.error('Error creando ciudad:', error);
    res.status(500).json({ success: false, message: 'Error al crear la ciudad' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { nombre, provincia, activa } = req.body;
    const ciudad = await prisma.ciudad.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && nombre.trim() && { nombre: normalizar(nombre) }),
        ...(provincia !== undefined && { provincia: provincia?.trim() || null }),
        ...(typeof activa === 'boolean' && { activa })
      }
    });
    res.json({ success: true, data: ciudad });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Esa ciudad ya existe' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Ciudad no encontrada' });
    }
    console.error('Error actualizando ciudad:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar la ciudad' });
  }
};

module.exports = { listar, crear, actualizar };
