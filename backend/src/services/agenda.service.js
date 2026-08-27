/**
 * Servicio de Agenda - Sistema de Lavado de Carros
 * Lógica de disponibilidad y bloqueo de franjas.
 *
 * Reglas:
 * - EXPRESO: capacidad = lavadores activos (servicio en el estacionamiento del cliente).
 * - PROFUNDA: capacidad = bahías de lavado disponibles (cliente trae el carro al taller).
 * - Una franja está bloqueada cuando ocupaciones >= capacidad.
 */

const prisma = require('../db');

// Comparación de horas "HH:mm"
const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const aHHMM = (minutos) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Dos franjas [ini1,fin1) e [ini2,fin2) se solapan
const solapan = (ini1, fin1, ini2, fin2) =>
  aMinutos(ini1) < aMinutos(fin2) && aMinutos(ini2) < aMinutos(fin1);

// Capacidad según modalidad
// - profunda: bahías físicas (global, el taller es uno)
// - expreso: capacidad del sitio si está configurada (>0); si no, lavadores activos globales
const obtenerCapacidad = async (modalidad, estacionamiento = null) => {
  if (modalidad === 'profunda') {
    return prisma.plaza.count({
      where: { tipo: 'bahia_lavado', estado: 'disponible' }
    });
  }
  if (estacionamiento && estacionamiento.capacidad_expreso > 0) {
    return estacionamiento.capacidad_expreso;
  }
  // expreso: lavadores activos
  return prisma.lavador.count({ where: { estado: 'activo' } });
};

// Ocupaciones activas que se solapan con una franja
// - profunda: cuenta global (bahías del taller)
// - expreso: cuenta solo lo ocupado en el mismo sitio; bloqueos manuales cuentan para todos
const contarOcupaciones = async ({ fecha, horaInicio, horaFin, modalidad, idEstacionamiento }) => {
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);

  const asignaciones = await prisma.asignacionAgenda.findMany({
    where: { fecha: dia, estado: { not: 'cancelado' } },
    include: { reserva: { select: { modalidad: true, id_estacionamiento: true } } }
  });

  const mismoSitio = (a) =>
    !a.reserva || // bloqueo manual: bloquea ambas modalidades en todos los sitios
    a.reserva.modalidad !== 'expreso' || // profunda no compite por sitios
    a.reserva.id_estacionamiento === Number(idEstacionamiento);

  return asignaciones.filter(
    (a) =>
      solapan(horaInicio, horaFin, a.hora_inicio, a.hora_fin) &&
      (!a.reserva || a.reserva.modalidad === modalidad) &&
      (modalidad === 'profunda' || mismoSitio(a))
  ).length;
};

/**
 * Devuelve las franjas del día con cupos restantes.
 * @param {string} fecha "YYYY-MM-DD"
 * @param {string} modalidad "expreso" | "profunda"
 * @param {number} duracionMin duración del servicio elegido
 * @param {number} [idEstacionamiento] obligatorio para expreso
 */
const disponibilidadDia = async ({ fecha, modalidad, duracionMin = 60, idEstacionamiento }) => {
  let apertura = '07:00';
  let cierre = '18:00';
  let est = null;

  if (idEstacionamiento) {
    est = await prisma.estacionamiento.findUnique({
      where: { id: parseInt(idEstacionamiento) }
    });
    if (!est) throw Object.assign(new Error('Estacionamiento no encontrado'), { statusCode: 404 });
    if (est.horario_apertura) apertura = est.horario_apertura;
    if (est.horario_cierre) cierre = est.horario_cierre;
  }

  const capacidad = await obtenerCapacidad(modalidad, est);
  // Granularidad de la grilla: configurable por sitio (default global 60 min)
  const granularidad = est?.duracion_franja_min > 0 ? est.duracion_franja_min : 60;
  const paso = Math.min(duracionMin, granularidad);

  const inicioMin = aMinutos(apertura);
  const finMin = aMinutos(cierre);
  const franjas = [];

  for (let t = inicioMin; t + duracionMin <= finMin; t += paso) {
    const horaInicio = aHHMM(t);
    const horaFin = aHHMM(t + duracionMin);
    const ocupadas = await contarOcupaciones({ fecha, horaInicio, horaFin, modalidad, idEstacionamiento });
    const cupos = Math.max(capacidad - ocupadas, 0);
    franjas.push({
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      capacidad,
      ocupadas,
      cupos,
      disponible: cupos > 0
    });
  }

  return { fecha, modalidad, capacidad, franjas };
};

module.exports = { disponibilidadDia, contarOcupaciones, obtenerCapacidad, solapan, aMinutos };
