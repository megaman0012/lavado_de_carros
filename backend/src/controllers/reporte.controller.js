/**
 * Controlador de Reportes - Total Clean Car
 * KPIs del negocio: lavados, ingresos, ocupación de agenda.
 * Exportación a Excel/PDF de los mismos datos.
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { UPLOAD_ROOT } = require('../config/upload');
const fechas = require('../utils/fechas');
const alcance = require('../utils/alcance');

// Día de negocio (medianoche UTC, ver utils/fechas.js). Un texto inválido se ignora.
const inicioDia = (f) => fechas.fechaDia(f) || fechas.hoy();
const LOGO = path.join(__dirname, '..', '..', 'assets', 'logo-mark.png');
const ahoraTexto = () => new Date().toLocaleString('es-EC', { timeZone: fechas.APP_TZ });

const rangoQuery = (req) => ({
  desde: req.query.desde ? inicioDia(req.query.desde) : new Date(0),
  hasta: req.query.hasta ? inicioDia(req.query.hasta) : new Date('2999-12-31')
});

// Ciudad del reporte: la del operador de ciudad, o la elegida en el filtro
// (?id_ciudad=) por quien tiene alcance nacional; null = todo el país.
// Cada reserva guarda su ciudad (la de su sitio, o la del sector si es a domicilio).
const deCiudad = (ciudad) => (ciudad ? { id_ciudad: ciudad } : {});
const reservaDeCiudad = (ciudad) => (ciudad ? { reserva: { is: deCiudad(ciudad) } } : {});

// `hasta` es un día (medianoche) y las reservas guardan solo el día, pero un pago
// guarda fecha Y hora: comparar con `lte: hasta` dejaba afuera todo lo cobrado
// ese último día. Para los pagos el límite es el comienzo del día siguiente.
const finDelDia = (dia) => fechas.sumarDias(dia, 1);

// ==================== CÁLCULOS (compartidos entre JSON y exportación) ====================

const calcularKPIs = async (ciudad = null) => {
  // "Hoy" en la zona del negocio: el contenedor corre en UTC y desde las 19:00
  // de Ecuador ya estaría contando el día siguiente
  const hoy = fechas.hoy();
  const manana = fechas.sumarDias(hoy, 1);
  const inicioSemana = fechas.sumarDias(hoy, -hoy.getUTCDay());
  const inicioMes = fechas.inicioMes(hoy);

  const [hoyCount, semanaCount, mesCount, ingresosMes, pendientesHoy, porEstado, calificaciones] = await Promise.all([
    prisma.reserva.count({ where: { fecha: { gte: hoy, lt: manana }, estado: { notIn: ['cancelada'] }, ...deCiudad(ciudad) } }),
    prisma.reserva.count({ where: { fecha: { gte: inicioSemana }, estado: { notIn: ['cancelada'] }, ...deCiudad(ciudad) } }),
    prisma.reserva.count({ where: { fecha: { gte: inicioMes }, estado: { notIn: ['cancelada'] }, ...deCiudad(ciudad) } }),
    prisma.pago.aggregate({
      where: { estado: 'aprobado', fecha_pago: { gte: inicioMes }, ...reservaDeCiudad(ciudad) },
      _sum: { monto: true }
    }),
    prisma.reserva.count({ where: { fecha: { gte: hoy }, estado: 'solicitada', ...deCiudad(ciudad) } }),
    prisma.reserva.groupBy({ by: ['estado'], where: deCiudad(ciudad), _count: true }),
    prisma.calificacion.aggregate({ where: reservaDeCiudad(ciudad), _avg: { puntuacion: true }, _count: true })
  ]);

  // Ocupación de hoy: franjas ocupadas vs capacidad total en horas operativas (07-18)
  const asignacionesHoy = await prisma.asignacionAgenda.findMany({
    where: {
      fecha: hoy,
      estado: { not: 'cancelado' },
      ...(ciudad && {
        OR: [
          reservaDeCiudad(ciudad),
          { id_reserva: null, id_ciudad: ciudad },
          { id_reserva: null, id_ciudad: null, id_estacionamiento: null }
        ]
      })
    }
  });
  const minutosOcupados = asignacionesHoy.reduce((acc, a) => {
    const [h1, m1] = a.hora_inicio.split(':').map(Number);
    const [h2, m2] = a.hora_fin.split(':').map(Number);
    return acc + ((h2 * 60 + m2) - (h1 * 60 + m1));
  }, 0);
  const capacidadDiariaMin = 11 * 60; // 07:00–18:00

  return {
    lavados_hoy: hoyCount,
    lavados_semana: semanaCount,
    lavados_mes: mesCount,
    ingresos_mes: ingresosMes._sum.monto || 0,
    solicitudes_pendientes: pendientesHoy,
    ocupacion_hoy_pct: Math.round((minutosOcupados / capacidadDiariaMin) * 100),
    calificacion_promedio: calificaciones._avg.puntuacion ? Math.round(calificaciones._avg.puntuacion * 10) / 10 : null,
    calificaciones_total: calificaciones._count,
    por_estado: porEstado.map((e) => ({ estado: e.estado, cantidad: e._count }))
  };
};

/**
 * Totales de un período elegido por el usuario (el mes que selecciona en
 * Reportes). Es distinto de calcularKPIs(), que siempre mira "hoy / esta semana
 * / este mes" y alimenta el Dashboard: ahí la pregunta es "¿cómo vamos ahora?",
 * acá es "¿cómo nos fue en septiembre?".
 *
 * Se devuelven FACTURADO y COBRADO por separado, que no son lo mismo y
 * confundirlos es el error clásico de un reporte de ingresos:
 *   - facturado: lo que suman las reservas del período (precio_final)
 *   - cobrado:   los pagos aprobados con fecha de pago dentro del período
 * Un lavado de fin de mes cobrado al mes siguiente cae en meses distintos, y
 * esa diferencia es justamente lo que hay que poder ver.
 *
 * Una visita a domicilio FALLIDA no es un lavado, pero su cargo se cobra: suma
 * a lo facturado y no a los lavados ni al ticket promedio.
 */
const NO_LAVADO = ['cancelada', 'no_asistio', 'fallida'];

const calcularResumenPeriodo = async (desde, hasta, ciudad = null) => {
  const enRango = { fecha: { gte: desde, lte: hasta }, ...deCiudad(ciudad) };

  const [hechas, fallidas, canceladas, noAsistio, cobrado, calificaciones, cobradoPlanes] = await Promise.all([
    prisma.reserva.aggregate({
      where: { ...enRango, estado: { notIn: NO_LAVADO } },
      _count: true,
      _sum: { precio_final: true }
    }),
    prisma.reserva.aggregate({
      where: { ...enRango, estado: 'fallida' },
      _count: true,
      _sum: { precio_final: true }
    }),
    prisma.reserva.count({ where: { ...enRango, estado: 'cancelada' } }),
    prisma.reserva.count({ where: { ...enRango, estado: 'no_asistio' } }),
    prisma.pago.aggregate({
      where: { estado: 'aprobado', fecha_pago: { gte: desde, lt: finDelDia(hasta) }, ...reservaDeCiudad(ciudad) },
      _sum: { monto: true }
    }),
    prisma.calificacion.aggregate({
      where: { reserva: { is: enRango } },
      _avg: { puntuacion: true },
      _count: true
    }),
    // Mensualidades de planes VIP: son de todo el país, no de una ciudad
    ciudad ? null : prisma.pagoSuscripcion.aggregate({
      where: { estado: 'aprobado', fecha_pago: { gte: desde, lt: finDelDia(hasta) } },
      _sum: { monto: true },
      _count: true
    })
  ]);

  const lavados = hechas._count || 0;
  const facturadoLavados = hechas._sum.precio_final || 0;
  const cargosFallidas = fallidas._sum.precio_final || 0;

  return {
    desde: fechas.aISO(desde),
    hasta: fechas.aISO(hasta),
    lavados,
    facturado: facturadoLavados + cargosFallidas,
    cobrado: cobrado._sum.monto || 0,
    // Sin lavados el promedio no es 0, es "no aplica": dividir por cero daría NaN
    // y mostrar "$0.00" haría pensar que se trabajó gratis.
    ticket_promedio: lavados > 0 ? Math.round((facturadoLavados / lavados) * 100) / 100 : null,
    canceladas,
    no_asistio: noAsistio,
    visitas_fallidas: fallidas._count || 0,
    // Aparte de "cobrado" (que es por lavado): lo que entró por planes VIP
    cobrado_planes: cobradoPlanes?._sum.monto || 0,
    pagos_planes: cobradoPlanes?._count || 0,
    cargos_visitas_fallidas: cargosFallidas,
    calificacion_promedio: calificaciones._avg.puntuacion
      ? Math.round(calificaciones._avg.puntuacion * 10) / 10
      : null,
    calificaciones_total: calificaciones._count
  };
};

const calcularPorServicio = async (desde, hasta, ciudad = null) => {
  const datos = await prisma.reserva.groupBy({
    by: ['id_tipo_servicio'],
    where: { fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada'] }, ...deCiudad(ciudad) },
    _count: true,
    _sum: { precio_final: true }
  });
  const servicios = await prisma.tipoServicio.findMany();
  return datos.map((d) => {
    const s = servicios.find((x) => x.id === d.id_tipo_servicio);
    return {
      servicio: s?.nombre || `Servicio ${d.id_tipo_servicio}`,
      modalidad: s?.modalidad,
      cantidad: d._count,
      ingresos: d._sum.precio_final || 0
    };
  }).sort((a, b) => b.cantidad - a.cantidad);
};

const calcularPorEstacionamiento = async (desde, hasta, ciudad = null) => {
  const datos = await prisma.reserva.groupBy({
    by: ['id_estacionamiento'],
    where: {
      fecha: { gte: desde, lte: hasta },
      estado: { notIn: ['cancelada'] },
      id_estacionamiento: { not: null },
      ...deCiudad(ciudad)
    },
    _count: true,
    _sum: { precio_final: true }
  });
  const sitios = await prisma.estacionamiento.findMany({ include: { ciudad: { select: { nombre: true } } } });
  return datos.map((d) => {
    const e = sitios.find((x) => x.id === d.id_estacionamiento);
    return {
      estacionamiento: e?.nombre || `Sitio ${d.id_estacionamiento}`,
      ciudad: e?.ciudad?.nombre || '',
      tipo: e?.tipo || '',
      cantidad: d._count,
      ingresos: d._sum.precio_final || 0
    };
  }).sort((a, b) => b.cantidad - a.cantidad);
};

/**
 * Panel nacional: una fila por ciudad activa (también las que no tuvieron
 * movimiento, que es un dato: una ciudad en cero se tiene que ver). Mismas
 * definiciones que calcularResumenPeriodo, para que la suma de las filas cuadre
 * con el resumen del país.
 */
const calcularPorCiudad = async (desde, hasta, ciudad = null) => {
  const [ciudades, reservas, pagos] = await Promise.all([
    prisma.ciudad.findMany({ where: ciudad ? { id: ciudad } : { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.reserva.findMany({
      where: { fecha: { gte: desde, lte: hasta }, ...deCiudad(ciudad) },
      select: {
        estado: true, precio_final: true,
        id_ciudad: true,
        calificacion: { select: { puntuacion: true } }
      }
    }),
    prisma.pago.findMany({
      where: { estado: 'aprobado', fecha_pago: { gte: desde, lt: finDelDia(hasta) }, ...reservaDeCiudad(ciudad) },
      select: { monto: true, reserva: { select: { id_ciudad: true } } }
    })
  ]);

  return ciudades.map((c) => {
    const suyas = reservas.filter((r) => r.id_ciudad === c.id);
    const hechas = suyas.filter((r) => !NO_LAVADO.includes(r.estado));
    const facturadoLavados = hechas.reduce((t, r) => t + (r.precio_final || 0), 0);
    const facturado = facturadoLavados + suyas
      .filter((r) => r.estado === 'fallida')
      .reduce((t, r) => t + (r.precio_final || 0), 0);
    const notas = suyas.filter((r) => r.calificacion).map((r) => r.calificacion.puntuacion);
    return {
      id_ciudad: c.id,
      ciudad: c.nombre,
      lavados: hechas.length,
      facturado,
      cobrado: pagos
        .filter((p) => p.reserva?.id_ciudad === c.id)
        .reduce((t, p) => t + p.monto, 0),
      ticket_promedio: hechas.length > 0 ? Math.round((facturadoLavados / hechas.length) * 100) / 100 : null,
      canceladas: suyas.filter((r) => r.estado === 'cancelada').length,
      no_asistio: suyas.filter((r) => r.estado === 'no_asistio').length,
      calificacion_promedio: notas.length > 0
        ? Math.round((notas.reduce((t, n) => t + n, 0) / notas.length) * 10) / 10
        : null
    };
  });
};

const calcularIngresos = async (desde, hasta, ciudad = null) => {
  const reservas = await prisma.reserva.findMany({
    where: { fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada'] }, ...deCiudad(ciudad) },
    select: { fecha: true, precio_final: true }
  });
  const mapa = {};
  for (const r of reservas) {
    const clave = r.fecha.toISOString().slice(0, 10);
    mapa[clave] = (mapa[clave] || 0) + (r.precio_final || 0);
  }
  return Object.entries(mapa)
    .map(([fecha, total]) => ({ fecha, total }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
};

// ==================== ENDPOINTS JSON ====================

const kpis = async (req, res) => {
  try {
    res.json({ success: true, data: await calcularKPIs(alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error calculando KPIs:', error);
    res.status(500).json({ success: false, message: 'Error al calcular KPIs' });
  }
};

// GET /api/reportes/resumen?desde=&hasta=  — totales del período elegido
const resumenPeriodo = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularResumenPeriodo(desde, hasta, alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error calculando el resumen del período:', error);
    res.status(500).json({ success: false, message: 'Error al calcular el resumen' });
  }
};

const porServicio = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularPorServicio(desde, hasta, alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error reporte por servicio:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

const porEstacionamiento = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularPorEstacionamiento(desde, hasta, alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error reporte por estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

// GET /api/reportes/por-ciudad?desde=&hasta=
const porCiudad = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularPorCiudad(desde, hasta, alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error reporte por ciudad:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

const ingresos = async (req, res) => {
  try {
    const hasta = req.query.hasta ? inicioDia(req.query.hasta) : fechas.hoy();
    const desde = req.query.desde ? inicioDia(req.query.desde) : fechas.sumarDias(hasta, -30);
    res.json({ success: true, data: await calcularIngresos(desde, hasta, alcance.ciudadFiltro(req)) });
  } catch (error) {
    console.error('Error reporte ingresos:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

// Detalle lavado por lavado: es lo que hace auditable el reporte (los agregados
// dicen cuánto, no cuál). Alimenta la hoja "Detalle de lavados" del Excel.
const calcularDetalle = async (desde, hasta, ciudad = null) => {
  const reservas = await prisma.reserva.findMany({
    where: { fecha: { gte: desde, lte: hasta }, ...deCiudad(ciudad) },
    include: {
      cliente: { select: { nombre: true, telefono: true } },
      vehiculo: { select: { placa: true, marca: true, modelo: true } },
      tipoServicio: { select: { nombre: true, modalidad: true } },
      estacionamiento: { select: { nombre: true, ciudad: { select: { nombre: true } } } },
      ciudad: { select: { nombre: true } },
      visita: { select: { codigo: true, direccion: true, sector: { select: { nombre: true } } } },
      asignaciones: { include: { lavador: { select: { nombre: true } } } },
      registro: true,
      pagos: true,
      calificacion: true
    },
    orderBy: [{ fecha: 'asc' }, { hora_inicio: 'asc' }]
  });

  return reservas.map((r) => {
    const contar = (json) => {
      if (!json) return 0;
      try { return JSON.parse(json).length; } catch (e) { return 0; }
    };
    const pagado = r.pagos.filter((p) => p.estado === 'aprobado').reduce((sum, p) => sum + p.monto, 0);
    return {
      codigo: r.codigo,
      fecha: r.fecha.toISOString().slice(0, 10),
      hora: `${r.hora_inicio} - ${r.hora_fin}`,
      estado: r.estado,
      cliente: r.cliente?.nombre || '',
      telefono: r.cliente?.telefono || '',
      vehiculo: [r.vehiculo?.placa, r.vehiculo?.marca, r.vehiculo?.modelo].filter(Boolean).join(' '),
      servicio: r.tipoServicio?.nombre || '',
      modalidad: r.tipoServicio?.modalidad || '',
      ciudad: r.ciudad?.nombre || '',
      sitio: r.estacionamiento?.nombre || (r.visita ? `A domicilio · ${r.visita.sector.nombre} · ${r.visita.direccion}` : ''),
      lavador: r.asignaciones.map((a) => a.lavador?.nombre).filter(Boolean).join(', ') || 'Sin asignar',
      precio: r.precio_final ?? 0,
      cobro: r.forma_cobro === 'credito' ? 'Crédito (corte)' : 'Contado',
      pagado,
      saldo: Math.max((r.precio_final ?? 0) - pagado, 0),
      observaciones: r.registro?.observaciones || '',
      fotos: contar(r.registro?.fotos_antes) + contar(r.registro?.fotos_despues),
      calificacion: r.calificacion?.puntuacion ?? ''
    };
  });
};

// ==================== EXPORTACIÓN ====================

const datosExportacion = async (req) => {
  const { desde, hasta } = rangoQuery(req);
  const ciudad = alcance.ciudadFiltro(req);
  const [kpisData, porServicioData, porEstacionamientoData, porCiudadData, ingresosData, detalleData, ciudadData] =
    await Promise.all([
      calcularKPIs(ciudad),
      calcularPorServicio(desde, hasta, ciudad),
      calcularPorEstacionamiento(desde, hasta, ciudad),
      calcularPorCiudad(desde, hasta, ciudad),
      calcularIngresos(desde, hasta, ciudad),
      calcularDetalle(desde, hasta, ciudad),
      ciudad ? prisma.ciudad.findUnique({ where: { id: ciudad } }) : null
    ]);
  // Título del alcance: el archivo tiene que decir de qué ciudad es, porque se
  // reenvía y deja de estar al lado del filtro que lo generó
  const ambito = ciudadData ? ciudadData.nombre : 'Todo el país';
  return { desde, hasta, ambito, kpisData, porServicioData, porEstacionamientoData, porCiudadData, ingresosData, detalleData };
};

// GET /api/reportes/exportar/excel?desde=&hasta=
const exportarExcel = async (req, res) => {
  try {
    const { ambito, kpisData, porServicioData, porEstacionamientoData, porCiudadData, ingresosData, detalleData } =
      await datosExportacion(req);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Total Clean Car';
    workbook.created = new Date();

    const estiloHeader = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } } };

    const resumen = workbook.addWorksheet('Resumen');
    resumen.columns = [{ header: 'Indicador', key: 'k', width: 28 }, { header: 'Valor', key: 'v', width: 18 }];
    resumen.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    resumen.addRows([
      { k: 'Ámbito', v: ambito },
      { k: 'Lavados hoy', v: kpisData.lavados_hoy },
      { k: 'Lavados esta semana', v: kpisData.lavados_semana },
      { k: 'Lavados este mes', v: kpisData.lavados_mes },
      { k: 'Ingresos del mes ($)', v: kpisData.ingresos_mes },
      { k: 'Solicitudes pendientes', v: kpisData.solicitudes_pendientes },
      { k: 'Ocupación de hoy (%)', v: kpisData.ocupacion_hoy_pct },
      { k: 'Calificación promedio', v: kpisData.calificacion_promedio ?? 'Sin datos' }
    ]);

    const hojaServicio = workbook.addWorksheet('Por servicio');
    hojaServicio.columns = [
      { header: 'Servicio', key: 'servicio', width: 28 },
      { header: 'Modalidad', key: 'modalidad', width: 14 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Ingresos ($)', key: 'ingresos', width: 14 }
    ];
    hojaServicio.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    hojaServicio.addRows(porServicioData);

    const hojaCiudad = workbook.addWorksheet('Por ciudad');
    hojaCiudad.columns = [
      { header: 'Ciudad', key: 'ciudad', width: 20 },
      { header: 'Lavados', key: 'lavados', width: 10 },
      { header: 'Facturado ($)', key: 'facturado', width: 14 },
      { header: 'Cobrado ($)', key: 'cobrado', width: 14 },
      { header: 'Ticket promedio ($)', key: 'ticket_promedio', width: 18 },
      { header: 'Canceladas', key: 'canceladas', width: 12 },
      { header: 'No asistió', key: 'no_asistio', width: 12 },
      { header: 'Calificación', key: 'calificacion_promedio', width: 12 }
    ];
    hojaCiudad.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    hojaCiudad.addRows(porCiudadData);

    const hojaSitio = workbook.addWorksheet('Por estacionamiento');
    hojaSitio.columns = [
      { header: 'Estacionamiento', key: 'estacionamiento', width: 28 },
      { header: 'Ciudad', key: 'ciudad', width: 16 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Ingresos ($)', key: 'ingresos', width: 14 }
    ];
    hojaSitio.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    hojaSitio.addRows(porEstacionamientoData);

    const hojaIngresos = workbook.addWorksheet('Ingresos por día');
    hojaIngresos.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Total ($)', key: 'total', width: 14 }
    ];
    hojaIngresos.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    hojaIngresos.addRows(ingresosData);

    // Una fila por lavado. Las fotos no se embeben a propósito: un mes de
    // evidencia haría un archivo de decenas de MB. Van en el acta PDF por reserva.
    const hojaDetalle = workbook.addWorksheet('Detalle de lavados');
    hojaDetalle.columns = [
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Horario', key: 'hora', width: 15 },
      { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Cliente', key: 'cliente', width: 24 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Vehículo', key: 'vehiculo', width: 26 },
      { header: 'Servicio', key: 'servicio', width: 24 },
      { header: 'Modalidad', key: 'modalidad', width: 12 },
      { header: 'Ciudad', key: 'ciudad', width: 14 },
      { header: 'Sitio', key: 'sitio', width: 24 },
      { header: 'Lavador', key: 'lavador', width: 20 },
      { header: 'Precio ($)', key: 'precio', width: 12 },
      { header: 'Cobro', key: 'cobro', width: 15 },
      { header: 'Pagado ($)', key: 'pagado', width: 12 },
      { header: 'Saldo ($)', key: 'saldo', width: 12 },
      { header: 'Observaciones', key: 'observaciones', width: 45 },
      { header: 'Fotos', key: 'fotos', width: 8 },
      { header: 'Calificación', key: 'calificacion', width: 12 }
    ];
    hojaDetalle.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    hojaDetalle.addRows(detalleData);
    hojaDetalle.views = [{ state: 'frozen', ySplit: 1 }];
    hojaDetalle.autoFilter = { from: 'A1', to: { row: 1, column: hojaDetalle.columns.length } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-total-clean-car-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exportando Excel:', error);
    res.status(500).json({ success: false, message: 'Error al generar el Excel' });
  }
};

// Logo de Total Clean Car arriba a la derecha de cada PDF. Si el archivo no
// está (imagen vieja del contenedor), el PDF sale igual, sin logo.
const encabezadoMarca = (doc) => {
  if (!fs.existsSync(LOGO)) return;
  const alto = 46;
  doc.image(LOGO, doc.page.width - doc.page.margins.right - alto * 0.65, doc.page.margins.top - 10, { height: alto });
};

// GET /api/reportes/exportar/pdf?desde=&hasta=
const exportarPDF = async (req, res) => {
  try {
    const { ambito, kpisData, porServicioData, porEstacionamientoData, porCiudadData } = await datosExportacion(req);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-total-clean-car-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    encabezadoMarca(doc);
    doc.fontSize(18).fillColor('#3459A5').text('Reporte - Total Clean Car', { align: 'left' });
    doc.fontSize(10).fillColor('#64748b').text(`${ambito} · Generado el ${ahoraTexto()}`);
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#1e293b').text('Resumen');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#334155');
    [
      ['Lavados hoy', kpisData.lavados_hoy],
      ['Lavados esta semana', kpisData.lavados_semana],
      ['Lavados este mes', kpisData.lavados_mes],
      ['Ingresos del mes', `$${kpisData.ingresos_mes.toFixed(2)}`],
      ['Solicitudes pendientes', kpisData.solicitudes_pendientes],
      ['Ocupación de hoy', `${kpisData.ocupacion_hoy_pct}%`],
      ['Calificación promedio', kpisData.calificacion_promedio ?? 'Sin datos']
    ].forEach(([k, v]) => doc.text(`${k}: ${v}`));
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#1e293b').text('Por servicio');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    if (porServicioData.length === 0) {
      doc.text('Sin datos en el rango seleccionado.');
    } else {
      porServicioData.forEach((s) => doc.text(`${s.servicio} (${s.modalidad}) — ${s.cantidad} lavados — $${s.ingresos.toFixed(2)}`));
    }
    doc.moveDown(1.5);

    // Comparativo entre ciudades: solo tiene sentido en el reporte nacional
    if (porCiudadData.length > 1) {
      doc.fontSize(14).fillColor('#1e293b').text('Por ciudad');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#334155');
      porCiudadData.forEach((c) => doc.text(
        `${c.ciudad} — ${c.lavados} lavados — facturado $${c.facturado.toFixed(2)} — cobrado $${c.cobrado.toFixed(2)}` +
        (c.calificacion_promedio ? ` — calificación ${c.calificacion_promedio}` : '')
      ));
      doc.moveDown(1.5);
    }

    doc.fontSize(14).fillColor('#1e293b').text('Por estacionamiento');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    if (porEstacionamientoData.length === 0) {
      doc.text('Sin datos en el rango seleccionado.');
    } else {
      porEstacionamientoData.forEach((s) =>
        doc.text(`${s.estacionamiento} (${s.ciudad}) — ${s.cantidad} lavados — $${s.ingresos.toFixed(2)}`));
    }

    doc.end();
  } catch (error) {
    console.error('Error exportando PDF:', error);
    res.status(500).json({ success: false, message: 'Error al generar el PDF' });
  }
};


// ==================== ACTA DE SERVICIO (PDF por reserva) ====================

/**
 * Resuelve la ruta en disco de un archivo subido a partir de la ruta pública
 * guardada en BD ("/uploads/evidencias/reserva-3/antes-1.jpg"), verificando que
 * no se escape de la carpeta de uploads.
 */
const rutaEnDisco = (rutaPublica) => {
  if (!rutaPublica || !rutaPublica.startsWith('/uploads/')) return null;
  const relativa = rutaPublica.replace('/uploads/', '');
  const absoluta = path.normalize(path.join(UPLOAD_ROOT, relativa));
  if (!absoluta.startsWith(path.normalize(UPLOAD_ROOT))) return null;
  return fs.existsSync(absoluta) ? absoluta : null;
};

// pdfkit solo embebe JPEG y PNG; el uploader además acepta webp/gif
const EMBEBIBLE = /\.(jpe?g|png)$/i;

const rutasDeFotos = (json) => {
  if (!json) return [];
  try {
    const lista = JSON.parse(json);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
};

/**
 * Las fuentes base de pdfkit (Helvetica) no traen glifos como ★ o ✓: se imprimen
 * como basura. Las estrellas se dibujan entonces como polígonos.
 */
const dibujarEstrellas = (doc, x, y, puntuacion, tamano = 12) => {
  for (let i = 0; i < 5; i += 1) {
    const cx = x + i * (tamano + 4) + tamano / 2;
    const cy = y + tamano / 2;
    const puntos = [];
    for (let v = 0; v < 10; v += 1) {
      const radio = v % 2 === 0 ? tamano / 2 : tamano / 4.5;
      const angulo = -Math.PI / 2 + (v * Math.PI) / 5;
      puntos.push([cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
    }
    doc.moveTo(puntos[0][0], puntos[0][1]);
    puntos.slice(1).forEach(([px, py]) => doc.lineTo(px, py));
    doc.closePath();
    if (i < puntuacion) {
      doc.fillColor('#f59e0b').fill();
    } else {
      doc.strokeColor('#cbd5e1').lineWidth(0.8).stroke();
    }
  }
};

/**
 * GET /api/reportes/reserva/:id/acta.pdf
 * Comprobante del trabajo hecho: datos de la reserva, checklist, descripción del
 * lavador, fotos antes/después, pagos y calificación. Es lo que el cliente se
 * lleva y lo que respalda un reclamo.
 */
const actaServicio = async (req, res) => {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        cliente: true,
        vehiculo: { include: { tipoVehiculo: true } },
        tipoServicio: true,
        estacionamiento: true,
        asignaciones: { include: { lavador: { select: { nombre: true } } } },
        registro: true,
        pagos: true,
        calificacion: true,
        adicionales: true,
        visita: { include: { sector: { select: { nombre: true } } } }
      }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // El cliente solo su acta; el lavador solo las que trabajó
    if (req.usuario.rol === 'cliente' && reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (req.usuario.rol === 'lavador' && !alcance.esTrabajoDelLavador(reserva, req.usuario)) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-${reserva.codigo}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const ANCHO = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const X = doc.page.margins.left;

    // espacioMin evita que un título quede al final de la página y su contenido
    // arranque en la siguiente (así el saldo no se separaba del resto de pagos)
    const titulo = (texto, espacioMin = 90) => {
      if (doc.y + espacioMin > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.moveDown(1);
      doc.fontSize(13).fillColor('#3459A5').text(texto);
      doc.moveTo(X, doc.y + 2).lineTo(X + ANCHO, doc.y + 2).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.6);
    };
    const campo = (etiqueta, valor) => {
      doc.fontSize(10).fillColor('#64748b').text(`${etiqueta}: `, { continued: true });
      doc.fillColor('#1e293b').text(String(valor ?? '—'));
    };

    // Encabezado
    encabezadoMarca(doc);
    doc.fontSize(20).fillColor('#3459A5').text('Acta de servicio');
    doc.fontSize(10).fillColor('#64748b')
      .text(`${reserva.codigo}  ·  emitida el ${ahoraTexto()}`);

    titulo('Datos del servicio');
    campo('Cliente', reserva.cliente?.nombre);
    campo('Teléfono', reserva.cliente?.telefono);
    campo('Vehículo', [reserva.vehiculo?.placa, reserva.vehiculo?.tipoVehiculo?.nombre, reserva.vehiculo?.marca, reserva.vehiculo?.modelo, reserva.vehiculo?.color].filter(Boolean).join(' · '));
    campo('Servicio', `${reserva.tipoServicio?.nombre} (${reserva.tipoServicio?.modalidad})`);
    if (reserva.adicionales.length > 0) {
      campo('Adicionales', reserva.adicionales.map((a) => `${a.nombre} ($${a.precio.toFixed(2)})`).join(', '));
    }
    campo('Lugar', reserva.estacionamiento?.nombre ||
      (reserva.visita ? `A domicilio (${reserva.visita.sector?.nombre}): ${reserva.visita.direccion}` : 'Bahía de lavado profundo'));
    campo('Fecha', `${fechas.formatoCorto(reserva.fecha)}  ${reserva.hora_inicio} - ${reserva.hora_fin}`);
    campo('Lavador', reserva.asignaciones.map((a) => a.lavador?.nombre).filter(Boolean).join(', ') || 'Sin asignar');
    campo('Estado', reserva.estado);

    // Checklist
    const checklist = reserva.registro?.checklist;
    if (checklist && typeof checklist === 'object' && Object.keys(checklist).length > 0) {
      titulo('Trabajo realizado');
      Object.entries(checklist).forEach(([clave, hecho]) => {
        doc.fontSize(10).fillColor(hecho ? '#16a34a' : '#94a3b8')
          .text(`${hecho ? '[X]' : '[  ]'}  ${clave.replace(/_/g, ' ')}`);
      });
    }

    // Descripción del lavador
    if (reserva.registro?.observaciones) {
      titulo('Observaciones');
      doc.fontSize(10).fillColor('#334155').text(reserva.registro.observaciones, { width: ANCHO, align: 'justify' });
    }

    // Evidencia fotográfica
    const grupos = [
      { etiqueta: 'Antes', rutas: rutasDeFotos(reserva.registro?.fotos_antes) },
      { etiqueta: 'Después', rutas: rutasDeFotos(reserva.registro?.fotos_despues) }
    ].filter((g) => g.rutas.length > 0);

    if (grupos.length > 0) {
      titulo('Evidencia fotográfica');
      const ANCHO_FOTO = (ANCHO - 15) / 2;
      const ALTO_FOTO = 130;

      grupos.forEach((grupo) => {
        doc.fontSize(10).fillColor('#475569').text(grupo.etiqueta);
        doc.moveDown(0.3);

        let columna = 0;
        let yFila = doc.y;
        let omitidas = 0;

        grupo.rutas.forEach((rutaPublica) => {
          const enDisco = rutaEnDisco(rutaPublica);
          if (!enDisco || !EMBEBIBLE.test(enDisco)) {
            omitidas += 1;
            return;
          }
          if (columna === 0 && yFila + ALTO_FOTO > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            yFila = doc.y;
          }
          try {
            doc.image(enDisco, X + columna * (ANCHO_FOTO + 15), yFila, {
              fit: [ANCHO_FOTO, ALTO_FOTO], align: 'center', valign: 'center'
            });
          } catch (e) {
            omitidas += 1;
            return;
          }
          columna += 1;
          if (columna === 2) {
            columna = 0;
            yFila += ALTO_FOTO + 10;
            doc.y = yFila;
          }
        });

        if (columna === 1) {
          doc.y = yFila + ALTO_FOTO + 10;
        }
        if (omitidas > 0) {
          doc.fontSize(8).fillColor('#94a3b8')
            .text(`(${omitidas} archivo(s) no se pudieron incluir en el PDF)`);
        }
        doc.moveDown(0.5);
      });
    }

    // Pagos
    titulo('Pagos', 160); // reserva alto suficiente para no partir la sección
    const aprobados = reserva.pagos.filter((p) => p.estado === 'aprobado');
    const pagado = aprobados.reduce((sum, p) => sum + p.monto, 0);
    campo('Valor total', `$${(reserva.precio_final ?? 0).toFixed(2)}`);
    if (aprobados.length === 0) {
      doc.fontSize(10).fillColor('#94a3b8').text('Sin pagos registrados.');
    } else {
      aprobados.forEach((p) => {
        const fecha = p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString('es-EC', { timeZone: fechas.APP_TZ }) : '';
        const extras = [p.referencia, p.comprobante_url ? 'comprobante adjunto' : null].filter(Boolean).join(' · ');
        doc.fontSize(10).fillColor('#334155')
          .text(`$${p.monto.toFixed(2)} — ${p.metodo} — ${fecha}${extras ? ` (${extras})` : ''}`);
      });
    }
    campo('Total pagado', `$${pagado.toFixed(2)}`);
    campo('Saldo', `$${Math.max((reserva.precio_final ?? 0) - pagado, 0).toFixed(2)}`);

    // Calificación
    if (reserva.calificacion) {
      titulo('Calificación del cliente');
      dibujarEstrellas(doc, X, doc.y, reserva.calificacion.puntuacion);
      doc.fontSize(10).fillColor('#64748b')
        .text(`${reserva.calificacion.puntuacion} de 5`, X + 90, doc.y + 2);
      doc.moveDown(1);
      if (reserva.calificacion.comentario) {
        doc.fontSize(10).fillColor('#334155').text(`"${reserva.calificacion.comentario}"`, X, doc.y);
      }
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8')
      .text('Documento generado automáticamente por Total Clean Car.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generando el acta de servicio:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error al generar el acta' });
    } else {
      res.end();
    }
  }
};

module.exports = {
  porCiudad,
  kpis,
  resumenPeriodo,
  porServicio,
  porEstacionamiento,
  ingresos,
  exportarExcel,
  exportarPDF,
  actaServicio
};
