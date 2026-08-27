/**
 * Controlador de Reportes - Sistema de Lavado de Carros
 * KPIs del negocio: lavados, ingresos, ocupación de agenda.
 * Exportación a Excel/PDF de los mismos datos.
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const prisma = require('../db');

const inicioDia = (f) => { const d = new Date(f); d.setHours(0, 0, 0, 0); return d; };

const rangoQuery = (req) => ({
  desde: req.query.desde ? inicioDia(req.query.desde) : new Date(0),
  hasta: req.query.hasta ? inicioDia(req.query.hasta) : new Date('2999-12-31')
});

// ==================== CÁLCULOS (compartidos entre JSON y exportación) ====================

const calcularKPIs = async () => {
  const hoy = inicioDia(new Date());
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  const inicioSemana = new Date(hoy); inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const [hoyCount, semanaCount, mesCount, ingresosMes, pendientesHoy, porEstado, calificaciones] = await Promise.all([
    prisma.reserva.count({ where: { fecha: { gte: hoy, lt: manana }, estado: { notIn: ['cancelada'] } } }),
    prisma.reserva.count({ where: { fecha: { gte: inicioSemana }, estado: { notIn: ['cancelada'] } } }),
    prisma.reserva.count({ where: { fecha: { gte: inicioMes }, estado: { notIn: ['cancelada'] } } }),
    prisma.pago.aggregate({
      where: { estado: 'aprobado', fecha_pago: { gte: inicioMes } },
      _sum: { monto: true }
    }),
    prisma.reserva.count({ where: { fecha: { gte: hoy }, estado: 'solicitada' } }),
    prisma.reserva.groupBy({ by: ['estado'], _count: true }),
    prisma.calificacion.aggregate({ _avg: { puntuacion: true }, _count: true })
  ]);

  // Ocupación de hoy: franjas ocupadas vs capacidad total en horas operativas (07-18)
  const asignacionesHoy = await prisma.asignacionAgenda.findMany({
    where: { fecha: hoy, estado: { not: 'cancelado' } }
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

const calcularPorServicio = async (desde, hasta) => {
  const datos = await prisma.reserva.groupBy({
    by: ['id_tipo_servicio'],
    where: { fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada'] } },
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

const calcularPorEstacionamiento = async (desde, hasta) => {
  const datos = await prisma.reserva.groupBy({
    by: ['id_estacionamiento'],
    where: { fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada'] }, id_estacionamiento: { not: null } },
    _count: true,
    _sum: { precio_final: true }
  });
  const sitios = await prisma.estacionamiento.findMany();
  return datos.map((d) => {
    const e = sitios.find((x) => x.id === d.id_estacionamiento);
    return {
      estacionamiento: e?.nombre || `Sitio ${d.id_estacionamiento}`,
      cantidad: d._count,
      ingresos: d._sum.precio_final || 0
    };
  }).sort((a, b) => b.cantidad - a.cantidad);
};

const calcularIngresos = async (desde, hasta) => {
  const reservas = await prisma.reserva.findMany({
    where: { fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada'] } },
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
    res.json({ success: true, data: await calcularKPIs() });
  } catch (error) {
    console.error('Error calculando KPIs:', error);
    res.status(500).json({ success: false, message: 'Error al calcular KPIs' });
  }
};

const porServicio = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularPorServicio(desde, hasta) });
  } catch (error) {
    console.error('Error reporte por servicio:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

const porEstacionamiento = async (req, res) => {
  try {
    const { desde, hasta } = rangoQuery(req);
    res.json({ success: true, data: await calcularPorEstacionamiento(desde, hasta) });
  } catch (error) {
    console.error('Error reporte por estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

const ingresos = async (req, res) => {
  try {
    const hasta = req.query.hasta ? inicioDia(req.query.hasta) : new Date();
    const desde = req.query.desde ? inicioDia(req.query.desde) : new Date(hasta.getTime() - 30 * 86400000);
    res.json({ success: true, data: await calcularIngresos(desde, hasta) });
  } catch (error) {
    console.error('Error reporte ingresos:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
};

// ==================== EXPORTACIÓN ====================

const datosExportacion = async (req) => {
  const { desde, hasta } = rangoQuery(req);
  const [kpisData, porServicioData, porEstacionamientoData, ingresosData] = await Promise.all([
    calcularKPIs(),
    calcularPorServicio(desde, hasta),
    calcularPorEstacionamiento(desde, hasta),
    calcularIngresos(desde, hasta)
  ]);
  return { desde, hasta, kpisData, porServicioData, porEstacionamientoData, ingresosData };
};

// GET /api/reportes/exportar/excel?desde=&hasta=
const exportarExcel = async (req, res) => {
  try {
    const { kpisData, porServicioData, porEstacionamientoData, ingresosData } = await datosExportacion(req);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Lavado de Carros';
    workbook.created = new Date();

    const estiloHeader = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } } };

    const resumen = workbook.addWorksheet('Resumen');
    resumen.columns = [{ header: 'Indicador', key: 'k', width: 28 }, { header: 'Valor', key: 'v', width: 18 }];
    resumen.getRow(1).eachCell((c) => Object.assign(c, estiloHeader));
    resumen.addRows([
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

    const hojaSitio = workbook.addWorksheet('Por estacionamiento');
    hojaSitio.columns = [
      { header: 'Estacionamiento', key: 'estacionamiento', width: 28 },
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-lavado-carros-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exportando Excel:', error);
    res.status(500).json({ success: false, message: 'Error al generar el Excel' });
  }
};

// GET /api/reportes/exportar/pdf?desde=&hasta=
const exportarPDF = async (req, res) => {
  try {
    const { kpisData, porServicioData, porEstacionamientoData } = await datosExportacion(req);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-lavado-carros-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).fillColor('#0284c7').text('Reporte - Sistema de Lavado de Carros', { align: 'left' });
    doc.fontSize(10).fillColor('#64748b').text(`Generado el ${new Date().toLocaleString()}`);
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

    doc.fontSize(14).fillColor('#1e293b').text('Por estacionamiento');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    if (porEstacionamientoData.length === 0) {
      doc.text('Sin datos en el rango seleccionado.');
    } else {
      porEstacionamientoData.forEach((s) => doc.text(`${s.estacionamiento} — ${s.cantidad} lavados — $${s.ingresos.toFixed(2)}`));
    }

    doc.end();
  } catch (error) {
    console.error('Error exportando PDF:', error);
    res.status(500).json({ success: false, message: 'Error al generar el PDF' });
  }
};

module.exports = { kpis, porServicio, porEstacionamiento, ingresos, exportarExcel, exportarPDF };
