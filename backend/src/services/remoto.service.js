/**
 * Lavado remoto (a domicilio) - Total Clean Car
 *
 * Un equipo móvil (UnidadMovil) sale a lavar a una dirección. A diferencia del
 * expreso —donde el recurso es el cupo de un sitio— acá el recurso es el EQUIPO,
 * y su tiempo incluye ir y volver:
 *
 *   hora_salida = inicio − traslado        hora_regreso = fin + traslado
 *
 * El traslado sale del sector de la dirección. Un equipo hace una visita a la
 * vez: dos visitas no pueden pisarse entre sus salidas y regresos. Una franja
 * tiene tantos cupos como equipos de la ciudad libres para ella.
 *
 * Precio: el del servicio para el tipo de vehículo (o la tarifa de la empresa)
 * + adicionales + el recargo del sector, una vez por visita.
 *
 * Visita fallida (no había acceso, ni agua o luz, el vehículo no estaba): sus
 * reservas pasan a "fallida" y se cobra el porcentaje del parámetro
 * `remoto.cargo_visita_fallida_pct` (100 por defecto).
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');
const { aMinutos, aHHMM, solapan } = require('./agenda.service');

const error = (statusCode, mensaje) => Object.assign(new Error(mensaje), { statusCode });

// Visitas que ocupan al equipo (las canceladas y fallidas ya no)
const OCUPAN = ['programada', 'en_camino', 'en_sitio', 'completada'];

const PARAM_FALLIDA = 'remoto.cargo_visita_fallida_pct';

const leerParametro = async (clave, porDefecto, db = prisma) => {
  const p = await db.parametro.findUnique({ where: { clave } });
  return p ? p.valor : porDefecto;
};

const pctVisitaFallida = async (db = prisma) => {
  const n = Number(await leerParametro(PARAM_FALLIDA, '100', db));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 100;
};

const sectorActivo = async (idSector, db = prisma) => {
  const sector = await db.sector.findUnique({
    where: { id: parseInt(idSector) || 0 },
    include: { ciudad: true }
  });
  if (!sector || !sector.activo || !sector.ciudad.activa) throw error(400, 'Sector no disponible para lavado a domicilio');
  return sector;
};

// Lo que hace falta para decidir la agenda de un día en una ciudad
const datosDelDia = async (dia, idCiudad, db = prisma) => {
  const [unidades, bloqueos] = await Promise.all([
    db.unidadMovil.findMany({
      where: { id_ciudad: idCiudad, estado: 'activo' },
      include: { visitas: { where: { fecha: dia, estado: { in: OCUPAN } } } },
      orderBy: { id: 'asc' }
    }),
    // Bloqueos manuales nacionales o de la ciudad (los de un sitio no tocan a domicilio)
    db.asignacionAgenda.findMany({
      where: {
        fecha: dia, id_reserva: null, estado: { not: 'cancelado' }, id_estacionamiento: null,
        OR: [{ id_ciudad: null }, { id_ciudad: idCiudad }]
      }
    })
  ]);
  return { unidades, bloqueos };
};

/**
 * ¿Qué equipos pueden hacer una visita que empieza a `inicioMin` y dura
 * `duracionMin`, con `traslado` minutos de ida y otros tantos de vuelta?
 */
const equiposLibres = ({ unidades, bloqueos }, inicioMin, duracionMin, traslado) => {
  const salida = aHHMM(inicioMin - traslado);
  const regreso = aHHMM(inicioMin + duracionMin + traslado);
  const trabajo = [aHHMM(inicioMin), aHHMM(inicioMin + duracionMin)];
  if (inicioMin - traslado < 0) return [];
  if (bloqueos.some((b) => solapan(trabajo[0], trabajo[1], b.hora_inicio, b.hora_fin))) return [];
  return unidades.filter((u) =>
    aMinutos(u.horario_inicio) <= inicioMin - traslado &&
    inicioMin + duracionMin + traslado <= aMinutos(u.horario_fin) &&
    !u.visitas.some((v) => solapan(salida, regreso, v.hora_salida, v.hora_regreso)));
};

/**
 * Franjas del día para un lavado a domicilio en un sector.
 * Mismo formato que agenda.service.disponibilidadDia, más el recargo del sector.
 */
const disponibilidad = async ({ fecha, idSector, duracionMin = 60 }) => {
  const dia = fechas.fechaDia(fecha);
  if (!dia) throw error(400, 'Fecha inválida');
  const sector = await sectorActivo(idSector);
  const datos = await datosDelDia(dia, sector.id_ciudad);
  const traslado = sector.traslado_min;

  const base = {
    fecha: fechas.aISO(dia), modalidad: 'remoto',
    sector: { id: sector.id, nombre: sector.nombre, recargo: sector.recargo, traslado_min: traslado }
  };
  if (datos.unidades.length === 0) return { ...base, capacidad: 0, franjas: [] };

  // Desde la primera salida posible hasta el último regreso posible de algún equipo
  const desde = Math.min(...datos.unidades.map((u) => aMinutos(u.horario_inicio))) + traslado;
  const hasta = Math.max(...datos.unidades.map((u) => aMinutos(u.horario_fin))) - traslado;
  const paso = duracionMin >= 60 ? 60 : 30;
  // Las franjas arrancan en :00 / :30 aunque el traslado no sea redondo
  const primera = Math.ceil(desde / paso) * paso;

  const hoy = fechas.hoy();
  const esHoy = dia.getTime() === hoy.getTime();
  const ahoraMin = aMinutos(fechas.horaActual());
  const franjas = [];
  for (let t = primera; t + duracionMin <= hasta; t += paso) {
    const libres = equiposLibres(datos, t, duracionMin, traslado).length;
    const pasada = dia < hoy || (esHoy && t - traslado <= ahoraMin); // el equipo ya tendría que haber salido
    franjas.push({
      hora_inicio: aHHMM(t),
      hora_fin: aHHMM(t + duracionMin),
      capacidad: datos.unidades.length,
      ocupadas: datos.unidades.length - libres,
      cupos: pasada ? 0 : libres,
      pasada,
      disponible: !pasada && libres > 0
    });
  }
  return { ...base, capacidad: datos.unidades.length, franjas };
};

const generarCodigo = async (db) => {
  const anio = fechas.hoy().getUTCFullYear();
  const ultima = await db.visita.findFirst({
    where: { codigo: { startsWith: `VIS-${anio}-` } },
    orderBy: { codigo: 'desc' }
  });
  const n = ultima ? parseInt(ultima.codigo.split('-')[2]) + 1 : 1;
  return `VIS-${anio}-${String(n).padStart(5, '0')}`;
};

/**
 * Valida los datos de la dirección y elige un equipo libre, DENTRO de la
 * transacción de crear la reserva (así dos pedidos simultáneos no se llevan el
 * mismo equipo). Crea la Visita y la devuelve con su equipo y sector.
 */
const crearVisita = async ({ db, dia, horaInicio, duracionMin, idCliente, domicilio }) => {
  const sector = await sectorActivo(domicilio.id_sector, db);
  if (!domicilio.direccion?.trim()) throw error(400, 'Indique la dirección del lavado a domicilio');

  const inicio = aMinutos(horaInicio);
  const datos = await datosDelDia(dia, sector.id_ciudad, db);
  const libres = equiposLibres(datos, inicio, duracionMin, sector.traslado_min);
  if (libres.length === 0) throw error(409, 'No hay un equipo disponible en ese horario. Elija otro.');

  // Agua y luz las pone el cliente, salvo que el equipo las lleve
  const tieneAgua = domicilio.tiene_agua === true || domicilio.tiene_agua === 'true';
  const tieneLuz = domicilio.tiene_luz === true || domicilio.tiene_luz === 'true';
  const unidad = libres.find((u) => (tieneAgua || u.lleva_agua) && (tieneLuz || u.lleva_energia));
  if (!unidad) {
    throw error(400, 'El lavado a domicilio necesita una toma de agua y una de luz en el lugar. Confirme que las hay.');
  }

  const coordenada = (v, max) => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
  };

  const visita = await db.visita.create({
    data: {
      codigo: await generarCodigo(db),
      id_cliente: idCliente,
      id_unidad: unidad.id,
      id_sector: sector.id,
      direccion: domicilio.direccion.trim(),
      referencia: domicilio.referencia?.trim() || null,
      latitud: coordenada(domicilio.latitud, 90),
      longitud: coordenada(domicilio.longitud, 180),
      contacto_nombre: domicilio.contacto_nombre?.trim() || null,
      contacto_telefono: domicilio.contacto_telefono?.trim() || null,
      tiene_agua: tieneAgua,
      tiene_luz: tieneLuz,
      fecha: dia,
      hora_salida: aHHMM(inicio - sector.traslado_min),
      hora_inicio: aHHMM(inicio),
      hora_fin: aHHMM(inicio + duracionMin),
      hora_regreso: aHHMM(inicio + duracionMin + sector.traslado_min),
      traslado_min: sector.traslado_min,
      recargo: sector.recargo
    },
    include: { unidad: { include: { lavadores: { where: { estado: 'activo' }, orderBy: { id: 'asc' } } } }, sector: true }
  });
  return visita;
};

// Distancia en metros entre dos puntos (haversine): llegada marcada vs dirección
const distanciaMetros = (lat1, lon1, lat2, lon2) => {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * La visita se cierra sola cuando sus reservas terminan: completada si se lavó
 * al menos una, cancelada si se cancelaron todas. Se llama tras cada cambio de
 * estado de una reserva a domicilio.
 */
const sincronizarVisita = async (idVisita, db = prisma) => {
  if (!idVisita) return;
  const visita = await db.visita.findUnique({ where: { id: idVisita }, include: { reservas: true } });
  if (!visita || ['completada', 'fallida', 'cancelada'].includes(visita.estado)) return;
  const estados = visita.reservas.map((r) => r.estado);
  if (estados.every((e) => e === 'cancelada')) {
    await db.visita.update({ where: { id: visita.id }, data: { estado: 'cancelada' } });
  } else if (estados.every((e) => ['completada', 'cancelada', 'no_asistio'].includes(e))) {
    await db.visita.update({ where: { id: visita.id }, data: { estado: 'completada', fin_en: new Date() } });
  }
};

module.exports = {
  PARAM_FALLIDA, OCUPAN, leerParametro, pctVisitaFallida, sectorActivo,
  disponibilidad, crearVisita, distanciaMetros, sincronizarVisita
};
