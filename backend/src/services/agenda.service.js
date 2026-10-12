/**
 * Servicio de Agenda - Total Clean Car
 * Lógica de disponibilidad y bloqueo de franjas.
 *
 * Funciona como la cartelera de un cine: cada franja es una "función" con un
 * cupo de "butacas" (lavadores o bahías). Una función se llena cuando
 * ocupaciones >= capacidad, y una función que ya empezó no se vende.
 *
 * Reglas (la operación es nacional, pero cada "cine" es de una sola ciudad):
 * - EXPRESO: capacidad = la configurada en el sitio o, si no tiene, los
 *   lavadores activos DE SU CIUDAD (servicio en el estacionamiento del cliente).
 * - PROFUNDA: capacidad = bahías disponibles DEL TALLER elegido (el cliente
 *   lleva el carro; hay un taller por ciudad).
 * - Bloqueos manuales: nacionales, de una ciudad o de un sitio (ver aplicaBloqueo).
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

// Capacidad según modalidad, para un sitio concreto
// - profunda: bahías disponibles de ESE taller
// - expreso: capacidad del sitio si está configurada (>0); si no, lavadores
//   activos de la ciudad del sitio
// Sin sitio (resumen de la vista del día) se cuenta lo de toda la ciudad
// `idCiudad`, o del país si tampoco se indica.
const obtenerCapacidad = async (modalidad, estacionamiento = null, db = prisma, idCiudad = null) => {
  if (modalidad === 'profunda') {
    const delSitio = estacionamiento
      ? { id_estacionamiento: estacionamiento.id }
      : idCiudad ? { estacionamiento: { id_ciudad: idCiudad } } : {};
    return db.plaza.count({
      where: { tipo: 'bahia_lavado', estado: 'disponible', ...delSitio }
    });
  }
  if (estacionamiento && estacionamiento.capacidad_expreso > 0) {
    return estacionamiento.capacidad_expreso;
  }
  const ciudad = estacionamiento?.id_ciudad || idCiudad;
  return db.lavador.count({ where: { estado: 'activo', ...(ciudad && { id_ciudad: ciudad }) } });
};

// ¿Un bloqueo manual afecta a este sitio? Nacional (sin ciudad ni sitio), de la
// ciudad del sitio, o del sitio mismo.
const aplicaBloqueo = (bloqueo, estacionamiento) => {
  if (bloqueo.id_estacionamiento) return bloqueo.id_estacionamiento === estacionamiento?.id;
  if (bloqueo.id_ciudad) return bloqueo.id_ciudad === estacionamiento?.id_ciudad;
  return true;
};

// Ocupaciones activas que se solapan con una franja, en UN sitio
// - reservas: solo las de la misma modalidad en el mismo sitio (para profunda,
//   el sitio es el taller)
// - bloqueos manuales: los que alcanzan al sitio (aplicaBloqueo), en ambas modalidades
// `db` permite correrlo dentro de la transacción de crear reserva.
// `asignaciones` permite reutilizar la lectura del día al recorrer muchas franjas.
const ocupacionesDelDia = (dia, db = prisma) =>
  db.asignacionAgenda.findMany({
    where: { fecha: dia, estado: { not: 'cancelado' } },
    include: { reserva: { select: { modalidad: true, id_estacionamiento: true } } }
  });

const contarOcupaciones = async ({ fecha, horaInicio, horaFin, modalidad, estacionamiento, db = prisma, asignaciones }) => {
  const dia = fechas.fechaDia(fecha);
  if (!asignaciones) asignaciones = await ocupacionesDelDia(dia, db);

  const cuenta = (a) =>
    a.reserva
      ? a.reserva.modalidad === modalidad && a.reserva.id_estacionamiento === estacionamiento.id
      : aplicaBloqueo(a, estacionamiento);

  return asignaciones.filter(
    (a) => solapan(horaInicio, horaFin, a.hora_inicio, a.hora_fin) && cuenta(a)
  ).length;
};

/**
 * El sitio tiene que servir para la modalidad: la limpieza profunda se hace en
 * un taller y el expreso en un sitio aliado que lo admita. Lanza 400 si no.
 */
const validarSitio = (est, modalidad) => {
  if (est.estado !== 'activo') {
    throw Object.assign(new Error('Estacionamiento no disponible'), { statusCode: 400 });
  }
  if (modalidad === 'profunda' && est.tipo !== 'taller') {
    throw Object.assign(new Error('La limpieza profunda se hace en un taller: elija uno'), { statusCode: 400 });
  }
  if (modalidad === 'expreso' && (est.tipo === 'taller' || !est.admite_expreso)) {
    throw Object.assign(new Error('Este sitio no admite servicio expreso'), { statusCode: 400 });
  }
};

/**
 * Devuelve las franjas del día con cupos restantes.
 * @param {string} fecha "YYYY-MM-DD"
 * @param {string} modalidad "expreso" | "profunda"
 * @param {number} duracionMin duración del servicio elegido
 * @param {number} idEstacionamiento el sitio (expreso) o el taller (profunda)
 */
const disponibilidadDia = async ({ fecha, modalidad, duracionMin = 60, idEstacionamiento }) => {
  const dia = fechas.fechaDia(fecha);
  if (!dia) throw Object.assign(new Error('Fecha inválida'), { statusCode: 400 });

  // Sin sitio no hay "cine": la capacidad depende de la ciudad y del lugar
  if (!parseInt(idEstacionamiento)) {
    throw Object.assign(
      new Error(modalidad === 'profunda' ? 'Indique el taller' : 'Indique el estacionamiento'),
      { statusCode: 400 }
    );
  }
  const est = await prisma.estacionamiento.findUnique({
    where: { id: parseInt(idEstacionamiento) }
  });
  if (!est) throw Object.assign(new Error('Estacionamiento no encontrado'), { statusCode: 404 });
  validarSitio(est, modalidad);
  const apertura = est.horario_apertura || '07:00';
  const cierre = est.horario_cierre || '18:00';

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
    const ocupadas = await contarOcupaciones({ fecha: dia, horaInicio, horaFin, modalidad, estacionamiento: est, asignaciones });
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

module.exports = {
  disponibilidadDia, contarOcupaciones, ocupacionesDelDia, obtenerCapacidad, aplicaBloqueo, validarSitio,
  solapan, aMinutos, aHHMM
};
