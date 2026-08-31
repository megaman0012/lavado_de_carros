/**
 * Controlador de Reservas - Sistema de Lavado de Carros
 * Entidad central del negocio. Incluye el flujo de estados:
 * solicitada → confirmada → en_proceso → completada | cancelada | no_asistio
 */

const prisma = require('../db');
const { firmarReserva, firmarReservas, firmarListaJSON } = require('../utils/firmaArchivos');
const agendaService = require('../services/agenda.service');
const notificacionService = require('../services/notificacion.service');

const incluir = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
  vehiculo: true,
  tipoServicio: true,
  estacionamiento: { select: { id: true, nombre: true, direccion: true } },
  plaza: true,
  asignaciones: { include: { lavador: { select: { id: true, nombre: true } } } },
  pagos: true,
  registro: true,
  calificacion: true
};

// Genera el siguiente código RES-YYYY-NNNNN
const generarCodigo = async (tx) => {
  const anio = new Date().getFullYear();
  const ultima = await tx.reserva.findFirst({
    where: { codigo: { startsWith: `RES-${anio}-` } },
    orderBy: { codigo: 'desc' }
  });
  const n = ultima ? parseInt(ultima.codigo.split('-')[2]) + 1 : 1;
  return `RES-${anio}-${String(n).padStart(5, '0')}`;
};

// Crear reserva + bloquear franja (TRANSACCIÓN anti doble-reserva)
const crear = async (req, res) => {
  try {
    const {
      id_vehiculo, id_tipo_servicio, id_estacionamiento,
      fecha, hora_inicio, observaciones
    } = req.body;

    // Cliente autenticado (rol cliente) o indicado por operador/admin
    const id_cliente = req.usuario.rol === 'cliente'
      ? req.usuario.id_cliente
      : req.body.id_cliente && parseInt(req.body.id_cliente);

    if (!id_cliente || !id_vehiculo || !id_tipo_servicio || !fecha || !hora_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios (cliente, vehículo, servicio, fecha, hora)'
      });
    }

    // Validaciones fuera de transacción
    const cliente = await prisma.cliente.findUnique({ where: { id: id_cliente } });
    if (!cliente) {
      return res.status(400).json({ success: false, message: 'Cliente inexistente' });
    }
    if (cliente.estado !== 'activo') {
      return res.status(403).json({ success: false, message: 'El cliente está suspendido y no puede reservar' });
    }

    const servicio = await prisma.tipoServicio.findUnique({ where: { id: parseInt(id_tipo_servicio) } });
    if (!servicio || !servicio.activo) {
      return res.status(400).json({ success: false, message: 'Servicio no disponible' });
    }

    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: parseInt(id_vehiculo) } });
    if (!vehiculo || vehiculo.id_cliente !== id_cliente) {
      return res.status(400).json({ success: false, message: 'Vehículo inválido para este cliente' });
    }

    if (servicio.modalidad === 'expreso' && !id_estacionamiento) {
      return res.status(400).json({ success: false, message: 'Debe indicar el estacionamiento para un servicio expreso' });
    }

    const fechaReserva = new Date(fecha);
    if (isNaN(fechaReserva.getTime())) {
      return res.status(400).json({ success: false, message: 'Fecha inválida' });
    }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (fechaReserva < hoy) {
      return res.status(400).json({ success: false, message: 'No se puede reservar en fechas pasadas' });
    }

    const hora_fin = agendaService.aMinutos(hora_inicio) + servicio.duracion_min;
    if (hora_fin > 24 * 60) {
      return res.status(400).json({ success: false, message: 'El servicio no cabe en el día seleccionado' });
    }
    const horaFinStr = `${String(Math.floor(hora_fin / 60)).padStart(2, '0')}:${String(hora_fin % 60).padStart(2, '0')}`;

    // TRANSACCIÓN: verificar cupo y crear todo atómicamente
    const reserva = await prisma.$transaction(async (tx) => {
      const dia = new Date(fechaReserva);
      dia.setHours(0, 0, 0, 0);

      const asignaciones = await tx.asignacionAgenda.findMany({
        where: { fecha: dia, estado: { not: 'cancelado' } },
        include: { reserva: { select: { modalidad: true } } }
      });

      const solapadas = asignaciones.filter(
        (a) =>
          (!a.reserva || a.reserva.modalidad === servicio.modalidad) &&
          agendaService.solapan(hora_inicio, horaFinStr, a.hora_inicio, a.hora_fin)
      ).length;

      const capacidad = await agendaService.obtenerCapacidad(servicio.modalidad);

      if (solapadas >= capacidad) {
        throw Object.assign(
          new Error('Franja no disponible. Por favor elija otro horario.'),
          { statusCode: 409 }
        );
      }

      // Plan del edificio/condominio: si el estacionamiento tiene una suscripción activa
      // para esta modalidad y aún hay cupo este mes, el lavado sale gratis (precio_final=0).
      let id_suscripcion = null;
      let precio_final = servicio.precio;
      let planCubre = null;
      if (id_estacionamiento) {
        const suscripcion = await tx.suscripcion.findFirst({
          where: { id_estacionamiento: parseInt(id_estacionamiento), estado: 'activa', plan: { modalidad: servicio.modalidad } },
          include: { plan: true }
        });
        if (suscripcion) {
          const inicioMes = new Date(dia.getFullYear(), dia.getMonth(), 1);
          const usoMes = await tx.reserva.count({
            where: { id_suscripcion: suscripcion.id, estado: { not: 'cancelada' }, fecha: { gte: inicioMes } }
          });
          if (usoMes < suscripcion.plan.lavados_incluidos) {
            id_suscripcion = suscripcion.id;
            precio_final = 0;
            planCubre = suscripcion.plan.nombre;
          }
        }
      }

      const nueva = await tx.reserva.create({
        data: {
          codigo: await generarCodigo(tx),
          id_cliente,
          id_vehiculo: parseInt(id_vehiculo),
          id_tipo_servicio: parseInt(id_tipo_servicio),
          id_estacionamiento: id_estacionamiento ? parseInt(id_estacionamiento) : null,
          id_suscripcion,
          modalidad: servicio.modalidad,
          fecha: dia,
          hora_inicio,
          hora_fin: horaFinStr,
          estado: 'solicitada',
          observaciones: observaciones?.trim() || null,
          precio_final
        }
      });

      await tx.asignacionAgenda.create({
        data: {
          id_reserva: nueva.id,
          fecha: dia,
          hora_inicio,
          hora_fin: horaFinStr,
          estado: 'pendiente'
        }
      });

      await tx.historialReserva.create({
        data: {
          id_reserva: nueva.id,
          accion: 'creacion',
          estado_nuevo: 'solicitada',
          motivo: planCubre ? `Cubierto por el plan: ${planCubre}` : null,
          usuario: req.usuario.username
        }
      });

      return nueva;
    });

    const completa = await prisma.reserva.findUnique({ where: { id: reserva.id }, include: incluir });
    await notificacionService.notificarCreacion(completa);
    res.status(201).json({ success: true, data: completa });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('Error creando reserva:', error);
    res.status(500).json({ success: false, message: 'Error al crear la reserva' });
  }
};

// Listado interno con filtros
const listar = async (req, res) => {
  try {
    const { fecha, estado, modalidad, id_estacionamiento } = req.query;
    const where = {};
    if (fecha) {
      const d = new Date(fecha); d.setHours(0, 0, 0, 0);
      where.fecha = d;
    }
    if (estado) where.estado = estado;
    if (modalidad) where.modalidad = modalidad;
    if (id_estacionamiento) where.id_estacionamiento = parseInt(id_estacionamiento);

    const reservas = await prisma.reserva.findMany({
      where,
      include: incluir,
      orderBy: [{ fecha: 'desc' }, { hora_inicio: 'asc' }]
    });
    res.json({ success: true, data: firmarReservas(reservas) });
  } catch (error) {
    console.error('Error listando reservas:', error);
    res.status(500).json({ success: false, message: 'Error al listar reservas' });
  }
};

// Reservas del cliente logueado
const misReservas = async (req, res) => {
  try {
    const reservas = await prisma.reserva.findMany({
      where: { id_cliente: req.usuario.id_cliente },
      include: incluir,
      orderBy: [{ fecha: 'desc' }, { hora_inicio: 'asc' }]
    });
    res.json({ success: true, data: firmarReservas(reservas) });
  } catch (error) {
    console.error('Error listando mis reservas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener sus reservas' });
  }
};

// Reservas asignadas al lavador logueado ("Mis trabajos")
const misTrabajos = async (req, res) => {
  try {
    const { fecha } = req.query;
    const where = {
      asignaciones: { some: { id_lavador: req.usuario.id_lavador, estado: { not: 'cancelado' } } }
    };
    if (fecha) {
      const d = new Date(fecha); d.setHours(0, 0, 0, 0);
      where.fecha = d;
    }

    const reservas = await prisma.reserva.findMany({
      where,
      include: incluir,
      orderBy: [{ fecha: 'desc' }, { hora_inicio: 'asc' }]
    });
    res.json({ success: true, data: firmarReservas(reservas) });
  } catch (error) {
    console.error('Error listando mis trabajos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener sus trabajos' });
  }
};

const obtenerPorId = async (req, res) => {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { ...incluir, historial: true, registro: true }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // Un cliente solo ve sus propias reservas
    if (req.usuario.rol === 'cliente' && reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    // Un lavador solo ve las reservas que tiene asignadas
    if (req.usuario.rol === 'lavador' && !reserva.asignaciones.some((a) => a.id_lavador === req.usuario.id_lavador)) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    res.json({ success: true, data: firmarReserva(reserva) });
  } catch (error) {
    console.error('Error obteniendo reserva:', error);
    res.status(500).json({ success: false, message: 'Error al obtener la reserva' });
  }
};

// Cambio de estado genérico con registro de historial y liberación de agenda
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const nuevoEstado = req.nuevoEstado; // inyectado por la ruta

    const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(id) }, include: { asignaciones: true } });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // Un cliente solo puede operar sus propias reservas
    if (req.usuario.rol === 'cliente' && reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    // Un lavador solo puede operar los trabajos que tiene asignados
    if (req.usuario.rol === 'lavador' && !reserva.asignaciones.some((a) => a.id_lavador === req.usuario.id_lavador)) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }

    const transicionesValidas = {
      confirmar: ['solicitada'],
      iniciar: ['confirmada'],
      completar: ['en_proceso'],
      cancelar: ['solicitada', 'confirmada'],
      no_asistio: ['confirmada', 'en_proceso']
    };
    if (!transicionesValidas[req.accion]?.includes(reserva.estado)) {
      return res.status(400).json({
        success: false,
        message: `No se puede ${req.accion} una reserva en estado "${reserva.estado}"`
      });
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      const r = await tx.reserva.update({
        where: { id: reserva.id },
        data: { estado: nuevoEstado },
        include: incluir
      });

      // Cancelación / no_asistio libera la franja de agenda
      if (nuevoEstado === 'cancelada' || nuevoEstado === 'no_asistio') {
        await tx.asignacionAgenda.updateMany({
          where: { id_reserva: reserva.id, estado: { not: 'cancelado' } },
          data: { estado: 'cancelado' }
        });
      }

      await tx.historialReserva.create({
        data: {
          id_reserva: reserva.id,
          accion: req.accion,
          estado_anterior: reserva.estado,
          estado_nuevo: nuevoEstado,
          motivo: motivo?.trim() || null,
          usuario: req.usuario.username
        }
      });

      return r;
    });

    if (nuevoEstado === 'confirmada') await notificacionService.notificarConfirmacion(actualizada);
    if (nuevoEstado === 'completada') await notificacionService.notificarCompletado(actualizada);

    res.json({ success: true, data: actualizada });
  } catch (error) {
    console.error('Error cambiando estado:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar la reserva' });
  }
};

// Asignar/quitar lavador de una reserva (admin/operador)
// Valida que el lavador no tenga otra franja solapada el mismo día
const asignarLavador = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_lavador } = req.body;

    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(id) },
      include: { asignaciones: true }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    if (!['solicitada', 'confirmada', 'en_proceso'].includes(reserva.estado)) {
      return res.status(400).json({ success: false, message: `No se puede asignar lavador a una reserva "${reserva.estado}"` });
    }

    let lavador = null;
    if (id_lavador) {
      lavador = await prisma.lavador.findUnique({ where: { id: parseInt(id_lavador) } });
      if (!lavador || lavador.estado !== 'activo') {
        return res.status(400).json({ success: false, message: 'Lavador inválido o inactivo' });
      }

      // Anti doble-asignación: sin otro trabajo solapado ese día
      const ocupadas = await prisma.asignacionAgenda.findMany({
        where: {
          id_lavador: lavador.id,
          fecha: reserva.fecha,
          estado: { not: 'cancelado' },
          id_reserva: { not: reserva.id }
        }
      });
      const solapa = ocupadas.some((a) =>
        agendaService.solapan(reserva.hora_inicio, reserva.hora_fin, a.hora_inicio, a.hora_fin)
      );
      if (solapa) {
        return res.status(409).json({
          success: false,
          message: `${lavador.nombre} ya tiene un trabajo asignado entre ${reserva.hora_inicio} y ${reserva.hora_fin}`
        });
      }
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.asignacionAgenda.updateMany({
        where: { id_reserva: reserva.id, estado: { not: 'cancelado' } },
        data: { id_lavador: id_lavador ? parseInt(id_lavador) : null }
      });

      await tx.historialReserva.create({
        data: {
          id_reserva: reserva.id,
          accion: id_lavador ? 'asignar_lavador' : 'quitar_lavador',
          estado_anterior: reserva.estado,
          estado_nuevo: reserva.estado,
          motivo: id_lavador ? `Lavador asignado: ${lavador.nombre}` : 'Lavador desasignado',
          usuario: req.usuario.username
        }
      });

      return tx.reserva.findUnique({ where: { id: reserva.id }, include: incluir });
    });

    res.json({ success: true, data: actualizada });
  } catch (error) {
    console.error('Error asignando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al asignar el lavador' });
  }
};

// Subir evidencia fotográfica (antes/después) del lavado
// Acumula sobre las fotos existentes en RegistroLavado
const subirEvidencia = async (req, res) => {
  try {
    const { id } = req.params;
    const tipo = req.body.tipo === 'despues' ? 'despues' : 'antes';
    const archivos = req.files || [];

    // Se admite guardar solo la descripción, sin fotos nuevas
    if (archivos.length === 0 && !req.body.observaciones?.trim()) {
      return res.status(400).json({ success: false, message: 'Suba al menos una foto o escriba una observación' });
    }

    const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(id) } });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // El lavador solo puede subir evidencia de trabajos que tiene asignados
    if (req.usuario.rol === 'lavador') {
      const asignado = await prisma.asignacionAgenda.findFirst({
        where: { id_reserva: reserva.id, id_lavador: req.usuario.id_lavador }
      });
      if (!asignado) return res.status(403).json({ success: false, message: 'No tiene este trabajo asignado' });
    }

    const campo = tipo === 'antes' ? 'fotos_antes' : 'fotos_despues';
    const rutasNuevas = archivos.map((f) => `/uploads/evidencias/reserva-${id}/${f.filename}`);

    const existente = await prisma.registroLavado.findUnique({ where: { id_reserva: reserva.id } });
    const previas = existente?.[campo] ? JSON.parse(existente[campo]) : [];

    // Descripción del trabajo hecho: la escribe el lavador junto con las fotos y
    // es lo que sale en el acta de servicio en PDF.
    const observaciones = req.body.observaciones?.trim();

    const data = {
      ...(rutasNuevas.length > 0 && { [campo]: JSON.stringify([...previas, ...rutasNuevas]) }),
      ...(observaciones && { observaciones }),
      ...(tipo === 'despues' && rutasNuevas.length > 0 && !existente?.fecha_fin && { fecha_fin: new Date() })
    };

    const registro = existente
      ? await prisma.registroLavado.update({ where: { id_reserva: reserva.id }, data })
      : await prisma.registroLavado.create({ data: { id_reserva: reserva.id, ...data } });

    res.json({
      success: true,
      data: {
        ...registro,
        fotos_antes: firmarListaJSON(registro.fotos_antes),
        fotos_despues: firmarListaJSON(registro.fotos_despues)
      }
    });
  } catch (error) {
    console.error('Error subiendo evidencia:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la evidencia' });
  }
};

// Calificar un lavado completado (cliente, una sola vez por reserva)
const calificar = async (req, res) => {
  try {
    const { id } = req.params;
    const puntuacion = parseInt(req.body.puntuacion);
    const comentario = req.body.comentario;

    if (!puntuacion || puntuacion < 1 || puntuacion > 5) {
      return res.status(400).json({ success: false, message: 'La puntuación debe ser un número entre 1 y 5' });
    }

    const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(id) } });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    if (reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (reserva.estado !== 'completada') {
      return res.status(400).json({ success: false, message: 'Solo se puede calificar un lavado completado' });
    }

    const existente = await prisma.calificacion.findUnique({ where: { id_reserva: reserva.id } });
    if (existente) {
      return res.status(409).json({ success: false, message: 'Esta reserva ya fue calificada' });
    }

    const calificacion = await prisma.calificacion.create({
      data: {
        id_reserva: reserva.id,
        id_cliente: reserva.id_cliente,
        puntuacion,
        comentario: comentario?.trim() || null
      }
    });
    res.status(201).json({ success: true, data: calificacion });
  } catch (error) {
    console.error('Error calificando reserva:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la calificación' });
  }
};

module.exports = { crear, listar, misReservas, misTrabajos, obtenerPorId, cambiarEstado, asignarLavador, subirEvidencia, calificar };
