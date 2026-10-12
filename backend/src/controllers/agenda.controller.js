/**
 * Controlador de Agenda - Total Clean Car
 * Disponibilidad de franjas, vista del día y bloqueos manuales.
 */

const prisma = require('../db');
const agendaService = require('../services/agenda.service');
const fechas = require('../utils/fechas');
const alcance = require('../utils/alcance');
const remotoService = require('../services/remoto.service');

// GET /api/agenda/disponibilidad?fecha=&modalidad=&duracion_min=&id_estacionamiento=
// A domicilio: modalidad=remoto&id_sector= (la capacidad son los equipos móviles)
const disponibilidad = async (req, res) => {
  try {
    const { fecha, modalidad, duracion_min, id_estacionamiento, id_sector } = req.query;

    if (!fecha || !modalidad) {
      return res.status(400).json({ success: false, message: 'fecha y modalidad son obligatorias' });
    }
    if (!['expreso', 'profunda', 'remoto'].includes(modalidad)) {
      return res.status(400).json({ success: false, message: 'modalidad inválida' });
    }
    if (modalidad === 'remoto') {
      const data = await remotoService.disponibilidad({ fecha, idSector: id_sector, duracionMin: parseInt(duracion_min) || 60 });
      return res.json({ success: true, data });
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

    // Lo de la ciudad (reservas de sus sitios y bloqueos de ella o de sus sitios)
    // más los bloqueos nacionales, que también la afectan.
    const ciudad = alcance.ciudadFiltro(req);
    const deLaCiudad = ciudad && {
      OR: [
        { reserva: { is: { id_ciudad: ciudad } } },
        { id_reserva: null, id_ciudad: ciudad },
        { id_reserva: null, estacionamiento: { is: { id_ciudad: ciudad } } },
        { id_reserva: null, id_ciudad: null, id_estacionamiento: null }
      ]
    };

    const asignaciones = await prisma.asignacionAgenda.findMany({
      where: { fecha: dia, ...deLaCiudad },
      include: {
        lavador: { select: { id: true, nombre: true } },
        reserva: {
          select: {
            id: true, codigo: true, estado: true, modalidad: true,
            hora_inicio: true, hora_fin: true,
            cliente: { select: { nombre: true, telefono: true } },
            vehiculo: { select: { placa: true, marca: true, modelo: true, color: true } },
            tipoServicio: { select: { nombre: true } },
            estacionamiento: { select: { nombre: true, ciudad: { select: { nombre: true } } } },
            ciudad: { select: { nombre: true } },
            visita: {
              select: {
                id: true, codigo: true, estado: true, direccion: true, hora_salida: true, hora_regreso: true,
                sector: { select: { nombre: true } }, unidad: { select: { nombre: true } }
              }
            }
          }
        },
        ciudad: { select: { id: true, nombre: true } },
        estacionamiento: { select: { id: true, nombre: true } }
      },
      orderBy: { hora_inicio: 'asc' }
    });

    // Sin ciudad, es el total del país (vista nacional)
    const capacidadExpreso = await agendaService.obtenerCapacidad('expreso', null, prisma, ciudad);
    const capacidadProfunda = await agendaService.obtenerCapacidad('profunda', null, prisma, ciudad);

    res.json({
      success: true,
      data: {
        fecha: fechas.aISO(dia),
        id_ciudad: ciudad || null,
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
// Alcance: id_estacionamiento (un sitio), id_ciudad (toda la ciudad) o ninguno
// (todo el país: solo quien tiene alcance nacional). Un operador de ciudad que
// no indica nada bloquea su ciudad, nunca el país.
const crearBloqueo = async (req, res) => {
  try {
    const { fecha, hora_inicio, hora_fin, nota } = req.body;
    let id_estacionamiento = alcance.aEntero(req.body.id_estacionamiento);
    let id_ciudad = alcance.aEntero(req.body.id_ciudad);

    if (id_estacionamiento) {
      const est = await prisma.estacionamiento.findUnique({ where: { id: id_estacionamiento } });
      if (!est) return res.status(400).json({ success: false, message: 'Estacionamiento inexistente' });
      id_ciudad = est.id_ciudad;
    } else if (id_ciudad) {
      const c = await prisma.ciudad.findUnique({ where: { id: id_ciudad } });
      if (!c) return res.status(400).json({ success: false, message: 'Ciudad inexistente' });
    } else {
      id_ciudad = alcance.ciudadFija(req.usuario);
    }
    if (!alcance.puedeVer(req.usuario, id_ciudad)) return alcance.fueraDeAlcance(res);

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
        id_ciudad,
        id_estacionamiento,
        fecha: dia,
        hora_inicio,
        hora_fin,
        estado: 'pendiente',
        nota: nota?.trim() || 'Bloqueo manual'
      },
      include: {
        lavador: { select: { id: true, nombre: true } },
        ciudad: { select: { id: true, nombre: true } },
        estacionamiento: { select: { id: true, nombre: true } }
      }
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
    // Un bloqueo nacional (sin ciudad) solo lo libera quien tiene alcance nacional
    if (!alcance.puedeVer(req.usuario, bloqueo.id_ciudad)) return alcance.fueraDeAlcance(res);

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
