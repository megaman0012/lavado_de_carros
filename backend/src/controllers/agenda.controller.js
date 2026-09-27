/**
 * Controlador de Agenda - Total Clean Car
 * Disponibilidad de franjas, vista del día y bloqueos manuales.
 */

const prisma = require('../db');
const agendaService = require('../services/agenda.service');
const fechas = require('../utils/fechas');

// GET /api/agenda/disponibilidad?fecha=&modalidad=&duracion_min=&id_estacionamiento=
const disponibilidad = async (req, res) => {
  try {
    const { fecha, modalidad, duracion_min, id_estacionamiento } = req.query;

    if (!fecha || !modalidad) {
      return res.status(400).json({ success: false, message: 'fecha y modalidad son obligatorias' });
    }
    if (!['expreso', 'profunda'].includes(modalidad)) {
      return res.status(400).json({ success: false, message: 'modalidad inválida' });
    }

    const resultado = await agendaService.disponibilidadDia({
      fecha,
      modalidad,
      duracionMin: parseInt(duracion_min) || 60,
      idEstacionamiento: id_estacionamiento
    });

    res.json({ success: true, data: resultado });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Error calculando disponibilidad:', error);
    res.status(500).json({ success: false, message: 'Error al calcular disponibilidad' });
  }
};

// GET /api/agenda?fecha=YYYY-MM-DD — vista completa del día para el panel interno
const vistaDia = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ success: false, message: 'fecha es obligatoria' });

    const dia = fechas.fechaDia(fecha);
    if (!dia) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const asignaciones = await prisma.asignacionAgenda.findMany({
      where: { fecha: dia },
      include: {
        lavador: { select: { id: true, nombre: true } },
        reserva: {
          select: {
            id: true, codigo: true, estado: true, modalidad: true,
            hora_inicio: true, hora_fin: true,
            cliente: { select: { nombre: true, telefono: true } },
            vehiculo: { select: { placa: true, marca: true, modelo: true, color: true } },
            tipoServicio: { select: { nombre: true } },
            estacionamiento: { select: { nombre: true } }
          }
        }
      },
      orderBy: { hora_inicio: 'asc' }
    });

    const capacidadExpreso = await agendaService.obtenerCapacidad('expreso');
    const capacidadProfunda = await agendaService.obtenerCapacidad('profunda');

    res.json({
      success: true,
      data: {
        fecha: fechas.aISO(dia),
        capacidades: { expreso: capacidadExpreso, profunda: capacidadProfunda },
        asignaciones
      }
    });
  } catch (error) {
    console.error('Error obteniendo agenda del día:', error);
    res.status(500).json({ success: false, message: 'Error al obtener la agenda' });
  }
};

// POST /api/agenda/bloqueos — bloqueo manual de franja (mantenimiento, imprevistos)
// Crea una ocupación sin reserva asociada; bloquea expreso Y profunda en esa franja.
const crearBloqueo = async (req, res) => {
  try {
    const { fecha, hora_inicio, hora_fin, nota } = req.body;

    if (!fecha || !hora_inicio || !hora_fin) {
      return res.status(400).json({ success: false, message: 'fecha, hora_inicio y hora_fin son obligatorios' });
    }
    if (agendaService.aMinutos(hora_fin) <= agendaService.aMinutos(hora_inicio)) {
      return res.status(400).json({ success: false, message: 'hora_fin debe ser mayor a hora_inicio' });
    }

    const dia = fechas.fechaDia(fecha);
    if (!dia) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const bloqueo = await prisma.asignacionAgenda.create({
      data: {
        id_reserva: null,
        fecha: dia,
        hora_inicio,
        hora_fin,
        estado: 'pendiente',
        nota: nota?.trim() || 'Bloqueo manual'
      },
      include: { lavador: { select: { id: true, nombre: true } } }
    });

    res.status(201).json({ success: true, data: bloqueo });
  } catch (error) {
    console.error('Error creando bloqueo:', error);
    res.status(500).json({ success: false, message: 'Error al crear el bloqueo' });
  }
};

// DELETE /api/agenda/bloqueos/:id — libera un bloqueo manual
const eliminarBloqueo = async (req, res) => {
  try {
    const bloqueo = await prisma.asignacionAgenda.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!bloqueo) return res.status(404).json({ success: false, message: 'Bloqueo no encontrado' });
    if (bloqueo.id_reserva !== null) {
      return res.status(400).json({ success: false, message: 'No es un bloqueo manual' });
    }

    await prisma.asignacionAgenda.update({
      where: { id: bloqueo.id },
      data: { estado: 'cancelado' }
    });
    res.json({ success: true, message: 'Bloqueo liberado' });
  } catch (error) {
    console.error('Error eliminando bloqueo:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar el bloqueo' });
  }
};

module.exports = { disponibilidad, vistaDia, crearBloqueo, eliminarBloqueo };
