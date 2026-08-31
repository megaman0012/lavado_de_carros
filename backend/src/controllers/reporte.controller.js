/**
 * Controlador de Reportes - Sistema de Lavado de Carros
 * KPIs del negocio: lavados, ingresos, ocupación de agenda.
 * Exportación a Excel/PDF de los mismos datos.
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { UPLOAD_ROOT } = require('../config/upload');

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

// Detalle lavado por lavado: es lo que hace auditable el reporte (los agregados
// dicen cuánto, no cuál). Alimenta la hoja "Detalle de lavados" del Excel.
const calcularDetalle = async (desde, hasta) => {
  const reservas = await prisma.reserva.findMany({
    where: { fecha: { gte: desde, lte: hasta } },
    include: {
      cliente: { select: { nombre: true, telefono: true } },
      vehiculo: { select: { placa: true, marca: true, modelo: true } },
      tipoServicio: { select: { nombre: true, modalidad: true } },
      estacionamiento: { select: { nombre: true } },
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
      sitio: r.estacionamiento?.nombre || 'Bahía de lavado',
      lavador: r.asignaciones.map((a) => a.lavador?.nombre).filter(Boolean).join(', ') || 'Sin asignar',
      precio: r.precio_final ?? 0,
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
  const [kpisData, porServicioData, porEstacionamientoData, ingresosData, detalleData] = await Promise.all([
    calcularKPIs(),
    calcularPorServicio(desde, hasta),
    calcularPorEstacionamiento(desde, hasta),
    calcularIngresos(desde, hasta),
    calcularDetalle(desde, hasta)
  ]);
  return { desde, hasta, kpisData, porServicioData, porEstacionamientoData, ingresosData, detalleData };
};

// GET /api/reportes/exportar/excel?desde=&hasta=
const exportarExcel = async (req, res) => {
  try {
    const { kpisData, porServicioData, porEstacionamientoData, ingresosData, detalleData } = await datosExportacion(req);

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
      { header: 'Sitio', key: 'sitio', width: 24 },
      { header: 'Lavador', key: 'lavador', width: 20 },
      { header: 'Precio ($)', key: 'precio', width: 12 },
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
        vehiculo: true,
        tipoServicio: true,
        estacionamiento: true,
        asignaciones: { include: { lavador: { select: { nombre: true } } } },
        registro: true,
        pagos: true,
        calificacion: true
      }
    });
    if (!reserva) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // El cliente solo su acta; el lavador solo las que trabajó
    if (req.usuario.rol === 'cliente' && reserva.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
    if (req.usuario.rol === 'lavador' && !reserva.asignaciones.some((a) => a.id_lavador === req.usuario.id_lavador)) {
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
      doc.fontSize(13).fillColor('#0284c7').text(texto);
      doc.moveTo(X, doc.y + 2).lineTo(X + ANCHO, doc.y + 2).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.6);
    };
    const campo = (etiqueta, valor) => {
      doc.fontSize(10).fillColor('#64748b').text(`${etiqueta}: `, { continued: true });
      doc.fillColor('#1e293b').text(String(valor ?? '—'));
    };

    // Encabezado
    doc.fontSize(20).fillColor('#0284c7').text('Acta de servicio');
    doc.fontSize(10).fillColor('#64748b')
      .text(`${reserva.codigo}  ·  emitida el ${new Date().toLocaleString('es-EC')}`);

    titulo('Datos del servicio');
    campo('Cliente', reserva.cliente?.nombre);
    campo('Teléfono', reserva.cliente?.telefono);
    campo('Vehículo', [reserva.vehiculo?.placa, reserva.vehiculo?.marca, reserva.vehiculo?.modelo, reserva.vehiculo?.color].filter(Boolean).join(' · '));
    campo('Servicio', `${reserva.tipoServicio?.nombre} (${reserva.tipoServicio?.modalidad})`);
    campo('Lugar', reserva.estacionamiento?.nombre || 'Bahía de lavado profundo');
    campo('Fecha', `${reserva.fecha.toISOString().slice(0, 10)}  ${reserva.hora_inicio} - ${reserva.hora_fin}`);
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
    campo('Valor del servicio', `$${(reserva.precio_final ?? 0).toFixed(2)}`);
    if (aprobados.length === 0) {
      doc.fontSize(10).fillColor('#94a3b8').text('Sin pagos registrados.');
    } else {
      aprobados.forEach((p) => {
        const fecha = p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString('es-EC') : '';
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
      .text('Documento generado automáticamente por el Sistema de Lavado de Carros.', { align: 'center' });

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

module.exports = { kpis, porServicio, porEstacionamiento, ingresos, exportarExcel, exportarPDF, actaServicio };
