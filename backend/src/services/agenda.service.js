/**
 * Servicio de Agenda - Total Clean Car
 * Lógica de disponibilidad y bloqueo de franjas.
 *
 * Funciona como la cartelera de un cine: cada franja es una "función" con un
 * cupo de "butacas" (lavadores o bahías). Una función se llena cuando
 * ocupaciones >= capacidad, y una función que ya empezó no se vende.
 *
 * Reglas:
 * - EXPRESO: capacidad = lavadores activos (servicio en el estacionamiento del cliente).
 * - PROFUNDA: capacidad = bahías de lavado disponibles (cliente trae el carro al taller).
 * - Una franja está bloqueada cuando ocupaciones >= capacidad.
 *
 * disponibilidadDia() y crear reserva usan las MISMAS funciones de conteo y
 * capacidad: antes crear reserva contaba todos los sitios contra la capacidad
 * global, y un sitio con capacidad propia podía mostrar "sin cupos" y aun así
 * aceptar la reserva (o al revés).
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');

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
const obtenerCapacidad = async (modalidad, estacionamiento = null, db = prisma) => {
  if (modalidad === 'profunda') {
    return db.plaza.count({
      where: { tipo: 'bahia_lavado', estado: 'disponible' }
    });
  }
  if (estacionamiento && estacionamiento.capacidad_expreso > 0) {
    return estacionamiento.capacidad_expreso;
  }
  // expreso: lavadores activos
  return db.lavador.count({ where: { estado: 'activo' } });
};

// Ocupaciones activas que se solapan con una franja
// - profunda: cuenta global (bahías del taller)
// - expreso: cuenta solo lo ocupado en el mismo sitio; bloqueos manuales cuentan para todos
// `db` permite correrlo dentro de la transacción de crear reserva.
// `asignaciones` permite reutilizar la lectura del día al recorrer muchas franjas.
const ocupacionesDelDia = (dia, db = prisma) =>
  db.asignacionAgenda.findMany({
    where: { fecha: dia, estado: { not: 'cancelado' } },
    include: { reserva: { select: { modalidad: true, id_estacionamiento: true } } }
  });

const contarOcupaciones = async ({ fecha, horaInicio, horaFin, modalidad, idEstacionamiento, db = prisma, asignaciones }) => {
  const dia = fechas.fechaDia(fecha);
  if (!asignaciones) asignaciones = await ocupacionesDelDia(dia, db);

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
  const dia = fechas.fechaDia(fecha);
  if (!dia) throw Object.assign(new Error('Fecha inválida'), { statusCode: 400 });

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
  // Las funciones empiezan en horarios fijos, como en un cine: servicios que
  // duran lo mismo o más que la franja arrancan en punto (07:00, 08:00...);
  // los más cortos, cada media hora. Antes el paso era la duración y un
  // servicio de 35 min ofrecía 07:35, 08:10, 08:45...
  const paso = duracionMin >= granularidad ? granularidad : Math.min(granularidad, 30);

  const inicioMin = aMinutos(apertura);
  const finMin = aMinutos(cierre);
  const franjas = [];

  // Días pasados no tienen funciones; hoy, las que ya empezaron no se venden
  const hoy = fechas.hoy();
  const esHoy = dia.getTime() === hoy.getTime();
  const ahoraMin = aMinutos(fechas.horaActual());
  const asignaciones = await ocupacionesDelDia(dia);

  for (let t = inicioMin; t + duracionMin <= finMin; t += paso) {
    const horaInicio = aHHMM(t);
    const horaFin = aHHMM(t + duracionMin);
    const ocupadas = await contarOcupaciones({ fecha: dia, horaInicio, horaFin, modalidad, idEstacionamiento, asignaciones });
    const cupos = Math.max(capacidad - ocupadas, 0);
    const pasada = dia < hoy || (esHoy && t <= ahoraMin);
    franjas.push({
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      capacidad,
      ocupadas,
      cupos: pasada ? 0 : cupos,
      pasada,
      disponible: !pasada && cupos > 0
    });
  }

  return { fecha: fechas.aISO(dia), modalidad, capacidad, apertura, cierre, franjas };
};

module.exports = { disponibilidadDia, contarOcupaciones, ocupacionesDelDia, obtenerCapacidad, solapan, aMinutos, aHHMM };
