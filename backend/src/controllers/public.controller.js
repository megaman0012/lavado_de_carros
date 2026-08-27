/**
 * Controlador Público - Sistema de Lavado de Carros
 * Endpoints sin autenticación para el portal web.
 */

const prisma = require('../db');

// GET /api/public/servicios — catálogo activo con precios
const servicios = async (req, res) => {
  try {
    const lista = await prisma.tipoServicio.findMany({
      where: { activo: true },
      select: {
        id: true, nombre: true, descripcion: true, modalidad: true,
        duracion_min: true, precio: true, orden_display: true
      },
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: lista });
  } catch (error) {
    console.error('Error listando servicios públicos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
};

// GET /api/public/estacionamientos — sitios que admiten servicio expreso
const estacionamientos = async (req, res) => {
  try {
    const lista = await prisma.estacionamiento.findMany({
      where: { estado: 'activo', admite_expreso: true },
      select: {
        id: true, nombre: true, direccion: true, ciudad: true,
        horario_apertura: true, horario_cierre: true
      },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: lista });
  } catch (error) {
    console.error('Error listando estacionamientos públicos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estacionamientos' });
  }
};

module.exports = { servicios, estacionamientos };
