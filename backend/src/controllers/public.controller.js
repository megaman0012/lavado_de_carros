/**
 * Controlador Público - Total Clean Car
 * Endpoints sin autenticación para el portal web.
 */

const prisma = require('../db');

// GET /api/public/servicios — catálogo activo con su tabla de precios por tipo
// de vehículo (solo filas activas de tipos activos) y el "desde $X" para la vitrina
const servicios = async (req, res) => {
  try {
    const lista = await prisma.tipoServicio.findMany({
      where: { activo: true },
      select: {
        id: true, nombre: true, descripcion: true, modalidad: true, orden_display: true,
        precios: {
          where: { activo: true, tipoVehiculo: { activo: true } },
          select: {
            id_tipo_vehiculo: true, precio: true, duracion_min: true,
            tipoVehiculo: { select: { codigo: true, nombre: true, orden_display: true } }
          },
          orderBy: { tipoVehiculo: { orden_display: 'asc' } }
        }
      },
      orderBy: { orden_display: 'asc' }
    });
    const data = lista
      .filter((s) => s.precios.length > 0) // sin ningún precio no se puede contratar
      .map((s) => ({ ...s, precio_desde: Math.min(...s.precios.map((p) => p.precio)) }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando servicios públicos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener servicios' });
  }
};

// GET /api/public/tipos-vehiculo — para el formulario de registro de vehículo
const tiposVehiculo = async (req, res) => {
  try {
    const lista = await prisma.tipoVehiculo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, descripcion: true },
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: lista });
  } catch (error) {
    console.error('Error listando tipos de vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener tipos de vehículo' });
  }
};

// GET /api/public/adicionales — extras que se pueden sumar a una reserva
const adicionales = async (req, res) => {
  try {
    const lista = await prisma.servicioAdicional.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, descripcion: true, precio: true, duracion_min: true },
      orderBy: { orden_display: 'asc' }
    });
    res.json({ success: true, data: lista });
  } catch (error) {
    console.error('Error listando adicionales:', error);
    res.status(500).json({ success: false, message: 'Error al obtener adicionales' });
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

module.exports = { servicios, tiposVehiculo, adicionales, estacionamientos };
