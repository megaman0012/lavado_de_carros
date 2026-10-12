/**
 * Controlador de Lavado remoto - Total Clean Car
 *
 *   Sectores   zonas de cada ciudad con su traslado y su recargo
 *   Equipos    unidades móviles y sus lavadores
 *   Visitas    la operación del día: en camino → llegada (GPS) → completada o fallida
 *   Parámetro  % que se cobra por una visita fallida
 *
 * Disponibilidad y creación de reservas a domicilio: services/remoto.service.js
 * y reserva.controller.js (crearADomicilio).
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');
const alcance = require('../utils/alcance');
const remotoService = require('../services/remoto.service');
const cobro = require('../services/cobro.service');
const { enviarCorreo } = require('../services/mail.service');
const { enviarRecordatorio } = require('../services/sms.service');
const { aMinutos } = require('../services/agenda.service');

const responderError = (res, error, contexto) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Ya existe un registro con ese nombre' });
  console.error(`Error ${contexto}:`, error);
  res.status(500).json({ success: false, message: `Error ${contexto}` });
};

const HORA = /^\d{2}:\d{2}$/;

// ==================== SECTORES ====================

const listarSectores = async (req, res) => {
  try {
    const ciudad = alcance.ciudadFiltro(req);
    const sectores = await prisma.sector.findMany({
      where: ciudad ? { id_ciudad: ciudad } : {},
      include: { ciudad: { select: { id: true, nombre: true } }, _count: { select: { visitas: true } } },
      orderBy: [{ ciudad: { nombre: 'asc' } }, { nombre: 'asc' }]
    });
    res.json({ success: true, data: sectores });
  } catch (error) {
    responderError(res, error, 'al listar los sectores');
  }
};

const datosSector = (body) => {
  const traslado = body.traslado_min !== undefined ? parseInt(body.traslado_min) : undefined;
  const recargo = body.recargo !== undefined ? Number(body.recargo) : undefined;
  if (traslado !== undefined && !(traslado >= 0 && traslado <= 240)) throw Object.assign(new Error('Traslado inválido (0 a 240 minutos)'), { statusCode: 400 });
  if (recargo !== undefined && !(recargo >= 0)) throw Object.assign(new Error('Recargo inválido'), { statusCode: 400 });
  return {
    ...(body.nombre?.trim() && { nombre: body.nombre.trim() }),
    ...(traslado !== undefined && { traslado_min: traslado }),
    ...(recargo !== undefined && { recargo }),
    ...(typeof body.activo === 'boolean' && { activo: body.activo })
  };
};

const crearSector = async (req, res) => {
  try {
    const id_ciudad = alcance.aEntero(req.body.id_ciudad) || alcance.ciudadFija(req.usuario);
    if (!id_ciudad) return res.status(400).json({ success: false, message: 'La ciudad es obligatoria' });
    if (!alcance.puedeVer(req.usuario, id_ciudad)) return alcance.fueraDeAlcance(res);
    if (!req.body.nombre?.trim()) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    const sector = await prisma.sector.create({ data: { id_ciudad, ...datosSector(req.body) } });
    res.status(201).json({ success: true, data: sector });
  } catch (error) {
    responderError(res, error, 'al crear el sector');
  }
};

const actualizarSector = async (req, res) => {
  try {
    const actual = await prisma.sector.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!actual) return res.status(404).json({ success: false, message: 'Sector no encontrado' });
    if (!alcance.puedeVer(req.usuario, actual.id_ciudad)) return alcance.fueraDeAlcance(res);
    const sector = await prisma.sector.update({ where: { id: actual.id }, data: datosSector(req.body) });
    res.json({ success: true, data: sector });
  } catch (error) {
    responderError(res, error, 'al actualizar el sector');
  }
};

// Público: sectores donde hoy se puede pedir lavado a domicilio (con equipo activo en la ciudad)
const sectoresPublicos = async (req, res) => {
  try {
    const idCiudad = alcance.aEntero(req.query.id_ciudad);
    const sectores = await prisma.sector.findMany({
      where: {
        activo: true,
        ...(idCiudad && { id_ciudad: idCiudad }),
        ciudad: { activa: true, unidades: { some: { estado: 'activo' } } }
      },
      select: { id: true, nombre: true, recargo: true, id_ciudad: true },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: sectores });
  } catch (error) {
    responderError(res, error, 'al listar los sectores');
  }
};

// ==================== EQUIPOS ====================

const incluirEquipo = {
  ciudad: { select: { id: true, nombre: true } },
  lavadores: { select: { id: true, nombre: true, estado: true } }
};

const listarUnidades = async (req, res) => {
  try {
    const ciudad = alcance.ciudadFiltro(req);
    const unidades = await prisma.unidadMovil.findMany({
      where: ciudad ? { id_ciudad: ciudad } : {},
      include: incluirEquipo,
      orderBy: [{ ciudad: { nombre: 'asc' } }, { nombre: 'asc' }]
    });
    res.json({ success: true, data: unidades });
  } catch (error) {
    responderError(res, error, 'al listar los equipos');
  }
};

const datosUnidad = (body) => {
  if (body.horario_inicio !== undefined && !HORA.test(body.horario_inicio)) throw Object.assign(new Error('Hora de inicio inválida'), { statusCode: 400 });
  if (body.horario_fin !== undefined && !HORA.test(body.horario_fin)) throw Object.assign(new Error('Hora de fin inválida'), { statusCode: 400 });
  if (body.estado !== undefined && !['activo', 'mantenimiento', 'inactivo'].includes(body.estado)) {
    throw Object.assign(new Error('Estado inválido (activo | mantenimiento | inactivo)'), { statusCode: 400 });
  }
  const capacidad = body.capacidad !== undefined ? parseInt(body.capacidad) : undefined;
  if (capacidad !== undefined && !(capacidad >= 1 && capacidad <= 10)) throw Object.assign(new Error('Capacidad inválida (1 a 10)'), { statusCode: 400 });
  return {
    ...(body.nombre?.trim() && { nombre: body.nombre.trim() }),
    ...(capacidad !== undefined && { capacidad }),
    ...(body.horario_inicio && { horario_inicio: body.horario_inicio }),
    ...(body.horario_fin && { horario_fin: body.horario_fin }),
    ...(typeof body.lleva_agua === 'boolean' && { lleva_agua: body.lleva_agua }),
    ...(typeof body.lleva_energia === 'boolean' && { lleva_energia: body.lleva_energia }),
    ...(body.estado && { estado: body.estado })
  };
};

// Los lavadores del equipo: de su misma ciudad. Pasar [] los libera.
const asignarLavadores = async (tx, unidad, ids) => {
  if (!Array.isArray(ids)) return;
  const lista = ids.map((x) => parseInt(x)).filter(Boolean);
  const lavadores = await tx.lavador.findMany({ where: { id: { in: lista } } });
  if (lavadores.length !== lista.length) throw Object.assign(new Error('Algún lavador no existe'), { statusCode: 400 });
  const ajeno = lavadores.find((l) => l.id_ciudad !== unidad.id_ciudad);
  if (ajeno) throw Object.assign(new Error(`${ajeno.nombre} trabaja en otra ciudad`), { statusCode: 400 });
  await tx.lavador.updateMany({ where: { id_unidad: unidad.id, id: { notIn: lista } }, data: { id_unidad: null } });
  if (lista.length) await tx.lavador.updateMany({ where: { id: { in: lista } }, data: { id_unidad: unidad.id } });
};

const crearUnidad = async (req, res) => {
  try {
    const id_ciudad = alcance.aEntero(req.body.id_ciudad) || alcance.ciudadFija(req.usuario);
    if (!id_ciudad) return res.status(400).json({ success: false, message: 'La ciudad es obligatoria' });
    if (!alcance.puedeVer(req.usuario, id_ciudad)) return alcance.fueraDeAlcance(res);
    if (!req.body.nombre?.trim()) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    const unidad = await prisma.$transaction(async (tx) => {
      const nueva = await tx.unidadMovil.create({ data: { id_ciudad, ...datosUnidad(req.body) } });
      await asignarLavadores(tx, nueva, req.body.lavadores);
      return tx.unidadMovil.findUnique({ where: { id: nueva.id }, include: incluirEquipo });
    });
    res.status(201).json({ success: true, data: unidad });
  } catch (error) {
    responderError(res, error, 'al crear el equipo');
  }
};

const actualizarUnidad = async (req, res) => {
  try {
    const actual = await prisma.unidadMovil.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!actual) return res.status(404).json({ success: false, message: 'Equipo no encontrado' });
    if (!alcance.puedeVer(req.usuario, actual.id_ciudad)) return alcance.fueraDeAlcance(res);
    const unidad = await prisma.$transaction(async (tx) => {
      await tx.unidadMovil.update({ where: { id: actual.id }, data: datosUnidad(req.body) });
      await asignarLavadores(tx, actual, req.body.lavadores);
      return tx.unidadMovil.findUnique({ where: { id: actual.id }, include: incluirEquipo });
    });
    res.json({ success: true, data: unidad });
  } catch (error) {
    responderError(res, error, 'al actualizar el equipo');
  }
};

// ==================== VISITAS ====================

const incluirVisita = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true, tipo: true } },
  sector: { select: { id: true, nombre: true, id_ciudad: true, ciudad: { select: { nombre: true } } } },
  unidad: { select: { id: true, nombre: true } },
  reservas: {
    select: {
      id: true, codigo: true, estado: true, precio_final: true, forma_cobro: true,
      vehiculo: { select: { placa: true, marca: true, modelo: true } },
      tipoServicio: { select: { nombre: true } }
    }
  }
};

// GET /api/visitas?fecha=&id_ciudad= — la hoja de ruta del día
const listarVisitas = async (req, res) => {
  try {
    const dia = fechas.fechaDia(req.query.fecha) || fechas.hoy();
    const ciudad = alcance.ciudadFiltro(req);
    const visitas = await prisma.visita.findMany({
      where: {
        fecha: dia,
        ...(ciudad && { sector: { is: { id_ciudad: ciudad } } }),
        // El lavador ve las de su equipo
        ...(req.usuario.rol === 'lavador' && { id_unidad: req.usuario.id_unidad || 0 })
      },
      include: incluirVisita,
      orderBy: [{ hora_salida: 'asc' }]
    });
    res.json({ success: true, data: visitas });
  } catch (error) {
    responderError(res, error, 'al listar las visitas');
  }
};

/**
 * La visita existe y quien pide puede operarla: un lavador de su equipo, o un
 * admin/operador con alcance sobre su ciudad. Si no, responde y devuelve null.
 */
const visitaOperable = async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: parseInt(req.params.id) || 0 }, include: incluirVisita });
  if (!visita) {
    res.status(404).json({ success: false, message: 'Visita no encontrada' });
    return null;
  }
  const permitido = req.usuario.rol === 'lavador'
    ? req.usuario.id_unidad === visita.id_unidad
    : alcance.puedeVer(req.usuario, visita.sector.id_ciudad);
  if (!permitido) {
    res.status(403).json({ success: false, message: 'Esta visita no es de su equipo ni de su ciudad' });
    return null;
  }
  return visita;
};

// Aviso al cliente de que el equipo salió (correo y WhatsApp/SMS si hay credenciales)
const avisarEnCamino = async (visita) => {
  const texto = `Total Clean Car: nuestro equipo va en camino a ${visita.direccion}. ` +
    `Llegada estimada ${visita.hora_inicio}. Código ${visita.codigo}.`;
  const telefono = visita.contacto_telefono || visita.cliente.telefono;
  await Promise.allSettled([
    enviarRecordatorio({ to: telefono, body: texto }),
    enviarCorreo({
      to: visita.cliente.email,
      subject: `Tu equipo de lavado va en camino (${visita.codigo})`,
      html: `<p>Hola ${visita.cliente.nombre}, ${texto.replace('Total Clean Car: ', '')}</p>`
    })
  ]);
};

// PUT /api/visitas/:id/en-camino
const enCamino = async (req, res) => {
  try {
    const visita = await visitaOperable(req, res);
    if (!visita) return;
    if (visita.estado !== 'programada') {
      return res.status(400).json({ success: false, message: `La visita está "${visita.estado}"` });
    }
    if (visita.reservas.every((r) => r.estado === 'cancelada')) {
      return res.status(400).json({ success: false, message: 'Todas sus reservas están canceladas' });
    }
    // Pago anticipado: el equipo no sale a hacer lavados de contado sin cobrar
    const conPagos = await prisma.reserva.findMany({ where: { id_visita: visita.id }, include: { pagos: true } });
    await cobro.exigirPagado(conPagos, 'salir a la visita');
    const actualizada = await prisma.visita.update({
      where: { id: visita.id },
      data: { estado: 'en_camino', salida_en: new Date() },
      include: incluirVisita
    });
    avisarEnCamino(actualizada).catch((e) => console.error('No se pudo avisar la salida:', e.message));
    res.json({ success: true, data: actualizada, message: 'Visita en camino: se avisó al cliente' });
  } catch (error) {
    responderError(res, error, 'al marcar la salida');
  }
};

/**
 * PUT /api/visitas/:id/llegada { latitud, longitud, precision }
 * El lavador marca la llegada con el GPS del celular: queda como prueba de
 * presencia. Si la dirección tiene coordenadas, se devuelve a cuántos metros
 * quedó la marca (más de 300 m se señala en el panel).
 */
const llegada = async (req, res) => {
  try {
    const visita = await visitaOperable(req, res);
    if (!visita) return;
    if (!['programada', 'en_camino'].includes(visita.estado)) {
      return res.status(400).json({ success: false, message: `La visita está "${visita.estado}"` });
    }
    const lat = Number(req.body.latitud);
    const lon = Number(req.body.longitud);
    const conGps = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
      req.body.latitud !== null && req.body.latitud !== undefined;
    const actualizada = await prisma.visita.update({
      where: { id: visita.id },
      data: {
        estado: 'en_sitio',
        llegada_en: new Date(),
        ...(conGps && {
          llegada_latitud: lat,
          llegada_longitud: lon,
          llegada_precision: Number(req.body.precision) || null
        }),
        ...(!visita.salida_en && { salida_en: new Date() })
      },
      include: incluirVisita
    });
    const distancia = conGps && visita.latitud != null && visita.longitud != null
      ? remotoService.distanciaMetros(lat, lon, visita.latitud, visita.longitud)
      : null;
    res.json({ success: true, data: { ...actualizada, distancia_m: distancia }, message: 'Llegada registrada' });
  } catch (error) {
    responderError(res, error, 'al marcar la llegada');
  }
};

/**
 * PUT /api/visitas/:id/fallida { motivo }
 * No se pudo lavar (sin acceso, sin agua o luz, el vehículo no estaba). Sus
 * reservas pendientes pasan a "fallida" con el cargo del parámetro (100 % por
 * defecto) como precio: se cobra como cualquier lavado (contado o corte).
 */
const fallida = async (req, res) => {
  try {
    const visita = await visitaOperable(req, res);
    if (!visita) return;
    if (!['programada', 'en_camino', 'en_sitio'].includes(visita.estado)) {
      return res.status(400).json({ success: false, message: `La visita está "${visita.estado}"` });
    }
    const motivo = req.body.motivo?.trim();
    if (!motivo) return res.status(400).json({ success: false, message: 'Indique por qué no se pudo lavar' });

    // No se marca fallida una visita cuyo horario todavía no llegó
    const hoy = fechas.hoy();
    if (visita.fecha > hoy ||
        (visita.fecha.getTime() === hoy.getTime() && aMinutos(visita.hora_salida) > aMinutos(fechas.horaActual()))) {
      return res.status(400).json({ success: false, message: 'La visita todavía no empezó: si no se hará, cancele la reserva' });
    }

    const pct = await remotoService.pctVisitaFallida();
    const actualizada = await prisma.$transaction(async (tx) => {
      const pendientes = visita.reservas.filter((r) => ['solicitada', 'confirmada', 'en_proceso'].includes(r.estado));
      for (const r of pendientes) {
        const cargo = Math.round((r.precio_final || 0) * pct) / 100;
        await tx.reserva.update({ where: { id: r.id }, data: { estado: 'fallida', precio_final: cargo } });
        await tx.asignacionAgenda.updateMany({
          where: { id_reserva: r.id, estado: { not: 'cancelado' } },
          data: { estado: 'cancelado' }
        });
        await tx.historialReserva.create({
          data: {
            id_reserva: r.id, accion: 'visita_fallida', estado_anterior: r.estado, estado_nuevo: 'fallida',
            motivo: `${motivo} · cargo de visita ${pct}%: $${cargo.toFixed(2)}`, usuario: req.usuario.username
          }
        });
      }
      return tx.visita.update({
        where: { id: visita.id },
        data: { estado: 'fallida', motivo_falla: motivo, fin_en: new Date() },
        include: incluirVisita
      });
    });
    res.json({ success: true, data: actualizada, message: `Visita fallida: se cobra el ${pct}%` });
  } catch (error) {
    responderError(res, error, 'al marcar la visita fallida');
  }
};

// ==================== PARÁMETROS ====================

const listarParametros = async (req, res) => {
  try {
    const parametros = await prisma.parametro.findMany({ orderBy: { clave: 'asc' } });
    res.json({ success: true, data: parametros });
  } catch (error) {
    responderError(res, error, 'al listar los parámetros');
  }
};

// Validación por clave: un parámetro mal cargado no puede romper los cobros
const entero = (min, max) => (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? String(n) : null;
};
const VALIDADORES = {
  [remotoService.PARAM_FALLIDA]: (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? String(n) : null;
  },
  // Pago antes del servicio (1 = obligatorio, 0 = no se exige; ver cobro.service.js)
  'reservas.pago_anticipado': entero(0, 1),
  // Prioridad VIP y anticipación de las reservas (ver beneficios.service.js)
  'reservas.dias_anticipacion': entero(1, 365),
  'vip.cupos_reservados': entero(0, 50),
  'vip.horas_liberacion': entero(0, 720)
};

const guardarParametro = async (req, res) => {
  try {
    const { clave } = req.params;
    const validar = VALIDADORES[clave];
    if (!validar) return res.status(404).json({ success: false, message: 'Parámetro desconocido' });
    const valor = validar(req.body.valor);
    if (valor === null) return res.status(400).json({ success: false, message: 'Valor fuera de rango para este parámetro' });
    const parametro = await prisma.parametro.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor }
    });
    res.json({ success: true, data: parametro });
  } catch (error) {
    responderError(res, error, 'al guardar el parámetro');
  }
};

// ==================== REPORTE ====================

/**
 * GET /api/visitas/reporte?desde=&hasta=&id_ciudad=
 * Productividad de los equipos (visitas, minutos de traslado vs de trabajo),
 * visitas y recargos por sector, y causas de las visitas fallidas.
 */
const reporte = async (req, res) => {
  try {
    const hoy = fechas.hoy();
    const desde = fechas.fechaDia(req.query.desde) || fechas.inicioMes(hoy);
    const hasta = fechas.fechaDia(req.query.hasta) || hoy;
    const ciudad = alcance.ciudadFiltro(req);
    const visitas = await prisma.visita.findMany({
      where: {
        fecha: { gte: desde, lte: hasta },
        estado: { not: 'cancelada' },
        ...(ciudad && { sector: { is: { id_ciudad: ciudad } } })
      },
      include: { unidad: { select: { nombre: true } }, sector: { select: { nombre: true } }, reservas: { select: { precio_final: true, estado: true } } }
    });
    const agrupar = (clave) => {
      const mapa = {};
      for (const v of visitas) {
        const k = clave(v);
        mapa[k] = mapa[k] || { nombre: k, visitas: 0, completadas: 0, fallidas: 0, carros: 0, min_traslado: 0, min_trabajo: 0, recargos: 0, ingresos: 0 };
        const m = mapa[k];
        m.visitas += 1;
        if (v.estado === 'completada') m.completadas += 1;
        if (v.estado === 'fallida') m.fallidas += 1;
        m.carros += v.reservas.filter((r) => r.estado === 'completada').length;
        m.min_traslado += v.traslado_min * 2;
        m.min_trabajo += aMinutos(v.hora_fin) - aMinutos(v.hora_inicio);
        if (v.estado !== 'fallida') m.recargos += v.recargo;
        m.ingresos += v.reservas.filter((r) => !['cancelada', 'no_asistio'].includes(r.estado))
          .reduce((t, r) => t + (r.precio_final || 0), 0);
      }
      return Object.values(mapa).sort((a, b) => b.visitas - a.visitas);
    };
    const causas = {};
    visitas.filter((v) => v.estado === 'fallida').forEach((v) => {
      causas[v.motivo_falla] = (causas[v.motivo_falla] || 0) + 1;
    });
    res.json({
      success: true,
      data: {
        desde: fechas.aISO(desde),
        hasta: fechas.aISO(hasta),
        por_equipo: agrupar((v) => v.unidad.nombre),
        por_sector: agrupar((v) => v.sector.nombre),
        causas_fallidas: Object.entries(causas).map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
      }
    });
  } catch (error) {
    responderError(res, error, 'al generar el reporte de lavado remoto');
  }
};

module.exports = {
  listarSectores, crearSector, actualizarSector, sectoresPublicos,
  listarUnidades, crearUnidad, actualizarUnidad,
  listarVisitas, enCamino, llegada, fallida,
  listarParametros, guardarParametro, reporte
};
