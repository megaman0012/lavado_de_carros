/**
 * Controlador de Empresas - Total Clean Car
 *
 * Dos públicos:
 *   - el panel (admin y operador nacional): tarifas pactadas y cortes
 *     mensuales de cada empresa (cerrar, facturar, pagar, anular, exportar);
 *   - el gestor de flota (el usuario de la empresa): "Mi flota", con el gasto
 *     por vehículo, sus cortes y sus parqueaderos privados.
 * La lógica de los cortes vive en services/corte.service.js.
 */

const ExcelJS = require('exceljs');
const prisma = require('../db');
const fechas = require('../utils/fechas');
const corteService = require('../services/corte.service');

// Errores de los servicios: { statusCode, message } → respuesta; el resto, 500
const responderError = (res, error, contexto) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  if (error.code === 'P2034') {
    return res.status(409).json({ success: false, message: 'Otra persona está cerrando este corte. Intente de nuevo.' });
  }
  console.error(`Error ${contexto}:`, error);
  res.status(500).json({ success: false, message: `Error ${contexto}` });
};

// ==================== PANEL ====================

// GET /api/empresas — empresas con lo que tienen pendiente de cortar
const listar = async (req, res) => {
  try {
    const empresas = await prisma.cliente.findMany({
      where: { tipo: 'empresa' },
      include: {
        usuario: { select: { id: true, username: true } },
        sitiosPrivados: { select: { id: true, nombre: true, ciudad: { select: { nombre: true } } } },
        _count: { select: { vehiculos: { where: { estado: 'activo' } }, tarifas: { where: { activo: true } } } },
        cortes: { orderBy: { createdAt: 'desc' }, take: 1, select: { codigo: true, periodo: true, estado: true, total: true } }
      },
      orderBy: { nombre: 'asc' }
    });
    const pendientes = await prisma.reserva.groupBy({
      by: ['id_cliente'],
      where: { forma_cobro: 'credito', id_corte: null, estado: { in: ['completada', 'fallida'] } },
      _count: true,
      _sum: { precio_final: true }
    });
    res.json({
      success: true,
      data: empresas.map(({ cortes, ...e }) => {
        const p = pendientes.find((x) => x.id_cliente === e.id);
        return {
          ...e,
          ultimo_corte: cortes[0] || null,
          pendiente: { cantidad: p?._count || 0, total: p?._sum.precio_final || 0 }
        };
      })
    });
  } catch (error) {
    responderError(res, error, 'al listar empresas');
  }
};

/**
 * GET /api/empresas/:id/tarifas — la tabla completa: cada servicio y tipo de
 * vehículo que se ofrece, con su precio de lista y el pactado (null = no hay,
 * paga el de lista).
 */
const tablaTarifas = async (idCliente) => {
  const [precios, pactadas] = await Promise.all([
    prisma.precioServicio.findMany({
      where: { activo: true, tipoServicio: { activo: true }, tipoVehiculo: { activo: true } },
      include: {
        tipoServicio: { select: { nombre: true, modalidad: true, orden_display: true } },
        tipoVehiculo: { select: { nombre: true, orden_display: true } }
      }
    }),
    prisma.tarifaEmpresa.findMany({ where: { id_cliente: idCliente, activo: true } })
  ]);
  return precios
    .sort((a, b) => a.tipoServicio.orden_display - b.tipoServicio.orden_display ||
      a.tipoVehiculo.orden_display - b.tipoVehiculo.orden_display)
    .map((p) => ({
      id_tipo_servicio: p.id_tipo_servicio,
      id_tipo_vehiculo: p.id_tipo_vehiculo,
      servicio: p.tipoServicio.nombre,
      modalidad: p.tipoServicio.modalidad,
      tipo_vehiculo: p.tipoVehiculo.nombre,
      precio_lista: p.precio,
      precio_empresa: pactadas.find((t) =>
        t.id_tipo_servicio === p.id_tipo_servicio && t.id_tipo_vehiculo === p.id_tipo_vehiculo)?.precio ?? null
    }));
};

const verTarifas = async (req, res) => {
  try {
    const empresa = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!empresa || empresa.tipo !== 'empresa') return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
    res.json({ success: true, data: await tablaTarifas(empresa.id) });
  } catch (error) {
    responderError(res, error, 'al obtener las tarifas');
  }
};

// PUT /api/empresas/:id/tarifas { tarifas: [{ id_tipo_servicio, id_tipo_vehiculo, precio | null }] }
// precio null o vacío = quitar la pactada (vuelve al precio de lista)
const guardarTarifas = async (req, res) => {
  try {
    const empresa = await prisma.cliente.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!empresa || empresa.tipo !== 'empresa') return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
    const lista = req.body?.tarifas;
    if (!Array.isArray(lista)) return res.status(400).json({ success: false, message: 'tarifas debe ser una lista' });

    const cambios = [];
    for (const t of lista) {
      const id_tipo_servicio = parseInt(t.id_tipo_servicio);
      const id_tipo_vehiculo = parseInt(t.id_tipo_vehiculo);
      if (!id_tipo_servicio || !id_tipo_vehiculo) {
        return res.status(400).json({ success: false, message: 'Cada tarifa necesita servicio y tipo de vehículo' });
      }
      const vacio = t.precio === null || t.precio === undefined || t.precio === '';
      const precio = vacio ? null : Number(t.precio);
      if (!vacio && !(precio >= 0)) {
        return res.status(400).json({ success: false, message: 'El precio debe ser un número mayor o igual a cero' });
      }
      cambios.push({ id_tipo_servicio, id_tipo_vehiculo, precio });
    }

    const clave = (c) => ({
      id_cliente_id_tipo_servicio_id_tipo_vehiculo: {
        id_cliente: empresa.id, id_tipo_servicio: c.id_tipo_servicio, id_tipo_vehiculo: c.id_tipo_vehiculo
      }
    });
    await prisma.$transaction(cambios.map((c) => (c.precio === null
      ? prisma.tarifaEmpresa.deleteMany({
        where: { id_cliente: empresa.id, id_tipo_servicio: c.id_tipo_servicio, id_tipo_vehiculo: c.id_tipo_vehiculo }
      })
      : prisma.tarifaEmpresa.upsert({
        where: clave(c),
        update: { precio: c.precio, activo: true },
        create: { id_cliente: empresa.id, id_tipo_servicio: c.id_tipo_servicio, id_tipo_vehiculo: c.id_tipo_vehiculo, precio: c.precio }
      }))));
    res.json({ success: true, data: await tablaTarifas(empresa.id), message: 'Tarifas guardadas' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ success: false, message: 'Servicio o tipo de vehículo inexistente' });
    }
    responderError(res, error, 'al guardar las tarifas');
  }
};

// GET /api/empresas/:id/corte-previo?periodo=2026-10
const previo = async (req, res) => {
  try {
    res.json({ success: true, data: await corteService.previsualizar(req.params.id, req.query.periodo) });
  } catch (error) {
    responderError(res, error, 'al calcular el corte');
  }
};

// GET /api/empresas/:id/cortes
const listarCortes = async (req, res) => {
  try {
    const cortes = await prisma.corteEmpresa.findMany({
      where: { id_cliente: parseInt(req.params.id) || 0 },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }]
    });
    res.json({ success: true, data: cortes });
  } catch (error) {
    responderError(res, error, 'al listar los cortes');
  }
};

// POST /api/empresas/:id/cortes { periodo, notas }
const cerrarCorte = async (req, res) => {
  try {
    const corte = await corteService.cerrar({
      idCliente: req.params.id, periodo: req.body?.periodo, notas: req.body?.notas, usuario: req.usuario.username
    });
    res.status(201).json({ success: true, data: corte, message: `Corte ${corte.codigo} cerrado` });
  } catch (error) {
    responderError(res, error, 'al cerrar el corte');
  }
};

const verCorte = async (req, res) => {
  try {
    res.json({ success: true, data: await corteService.detalle(req.params.id) });
  } catch (error) {
    responderError(res, error, 'al obtener el corte');
  }
};

const facturarCorte = async (req, res) => {
  try {
    res.json({ success: true, data: await corteService.facturar(req.params.id, req.body || {}), message: 'Corte facturado' });
  } catch (error) {
    responderError(res, error, 'al facturar el corte');
  }
};

const pagarCorte = async (req, res) => {
  try {
    const corte = await corteService.pagar(req.params.id, req.body || {}, req.usuario.username);
    res.json({ success: true, data: corte, message: 'Pago registrado' });
  } catch (error) {
    responderError(res, error, 'al registrar el pago del corte');
  }
};

const anularCorte = async (req, res) => {
  try {
    const corte = await corteService.anular(req.params.id, req.body || {}, req.usuario.username);
    res.json({ success: true, data: corte, message: 'Corte anulado: sus lavados quedan pendientes' });
  } catch (error) {
    responderError(res, error, 'al anular el corte');
  }
};

/**
 * Excel del corte: lo que se le pasa al sistema contable para emitir la factura
 * y lo que la empresa recibe como respaldo. Hoja "Corte" con los datos de
 * facturación y el detalle lavado por lavado; hoja "Por vehículo" con el resumen.
 */
const escribirExcel = async (res, corte) => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Total Clean Car';
  libro.created = new Date();
  const encabezado = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } } };
  const dinero = '"$"#,##0.00';

  const hoja = libro.addWorksheet('Corte');
  const datos = [
    ['Corte', corte.codigo],
    ['Estado', corte.estado],
    ['Período', `${fechas.aISO(corte.desde)} a ${fechas.aISO(corte.hasta)}`],
    ['Empresa', corte.cliente.nombre],
    ['Razón social', corte.cliente.razon_social || ''],
    ['RUC', corte.cliente.ruc || ''],
    ['Email de facturación', corte.cliente.email_facturacion || ''],
    ['Dirección fiscal', corte.cliente.direccion_fiscal || ''],
    ['Factura', corte.numero_factura || 'pendiente'],
    ['Lavados', corte.cantidad],
    ['Total', corte.total]
  ];
  datos.forEach(([k, v]) => {
    const r = hoja.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  hoja.getRow(datos.length).getCell(2).numFmt = dinero;
  hoja.addRow([]);

  const columnas = [
    ['Código', 'codigo', 16], ['Fecha', 'fecha', 12], ['Hora', 'hora', 8], ['Placa', 'placa', 12],
    ['Vehículo', 'vehiculo', 20], ['Tipo', 'tipo_vehiculo', 12], ['Servicio', 'servicio', 24],
    ['Adicionales', 'adicionales', 26], ['Sitio', 'sitio', 24], ['Ciudad', 'ciudad', 14], ['Nota', 'nota', 24], ['Total ($)', 'total', 12]
  ];
  const filaTitulos = hoja.addRow(columnas.map((c) => c[0]));
  filaTitulos.eachCell((c) => Object.assign(c, encabezado));
  columnas.forEach((c, i) => { hoja.getColumn(i + 1).width = Math.max(c[2], i === 0 ? 22 : 0); });
  corte.filas.forEach((f) => {
    const r = hoja.addRow(columnas.map((c) => f[c[1]]));
    r.getCell(columnas.length).numFmt = dinero;
  });
  const filaTotal = hoja.addRow([...Array(columnas.length - 2).fill(''), 'TOTAL', corte.total]);
  filaTotal.font = { bold: true };
  filaTotal.getCell(columnas.length).numFmt = dinero;

  const porVehiculo = {};
  corte.filas.forEach((f) => {
    porVehiculo[f.placa] = porVehiculo[f.placa] || { placa: f.placa, vehiculo: f.vehiculo, lavados: 0, total: 0 };
    porVehiculo[f.placa].lavados += 1;
    porVehiculo[f.placa].total += f.total;
  });
  const hojaV = libro.addWorksheet('Por vehículo');
  hojaV.columns = [
    { header: 'Placa', key: 'placa', width: 12 }, { header: 'Vehículo', key: 'vehiculo', width: 24 },
    { header: 'Lavados', key: 'lavados', width: 10 }, { header: 'Total ($)', key: 'total', width: 14, style: { numFmt: dinero } }
  ];
  hojaV.getRow(1).eachCell((c) => Object.assign(c, encabezado));
  hojaV.addRows(Object.values(porVehiculo).sort((a, b) => b.total - a.total));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${corte.codigo}.xlsx"`);
  await libro.xlsx.write(res);
  res.end();
};

const excelCorte = async (req, res) => {
  try {
    await escribirExcel(res, await corteService.detalle(req.params.id));
  } catch (error) {
    responderError(res, error, 'al generar el Excel del corte');
  }
};

// ==================== GESTOR DE FLOTA ("Mi flota") ====================

// Solo el usuario de una empresa: middleware de las rutas /api/mi-empresa
const soloEmpresa = async (req, res, next) => {
  try {
    const cliente = req.usuario.id_cliente && await prisma.cliente.findUnique({ where: { id: req.usuario.id_cliente } });
    if (!cliente || cliente.tipo !== 'empresa') {
      return res.status(403).json({ success: false, message: 'Disponible solo para cuentas de empresa' });
    }
    req.empresa = cliente;
    next();
  } catch (error) {
    responderError(res, error, 'al validar la empresa');
  }
};

/**
 * GET /api/mi-empresa/resumen?desde=&hasta= — gasto por vehículo en el rango
 * (por defecto, el mes en curso) y lo que todavía no entró en un corte.
 */
const miResumen = async (req, res) => {
  try {
    const hoy = fechas.hoy();
    const desde = fechas.fechaDia(req.query.desde) || fechas.inicioMes(hoy);
    const hasta = fechas.fechaDia(req.query.hasta) || hoy;
    const [reservas, pendiente] = await Promise.all([
      prisma.reserva.findMany({
        where: { id_cliente: req.empresa.id, fecha: { gte: desde, lte: hasta }, estado: { notIn: ['cancelada', 'no_asistio'] } },
        include: { vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } } }
      }),
      prisma.reserva.aggregate({
        where: { id_cliente: req.empresa.id, forma_cobro: 'credito', id_corte: null, estado: { in: ['completada', 'fallida'] } },
        _count: true,
        _sum: { precio_final: true }
      })
    ]);
    const porVehiculo = {};
    for (const r of reservas) {
      const v = r.vehiculo;
      porVehiculo[v.id] = porVehiculo[v.id] || {
        id_vehiculo: v.id, placa: v.placa, vehiculo: [v.marca, v.modelo].filter(Boolean).join(' '),
        lavados: 0, completados: 0, gasto: 0
      };
      porVehiculo[v.id].lavados += 1;
      if (r.estado === 'completada') {
        porVehiculo[v.id].completados += 1;
        porVehiculo[v.id].gasto += r.precio_final || 0;
      }
    }
    const filas = Object.values(porVehiculo).sort((a, b) => b.gasto - a.gasto);
    res.json({
      success: true,
      data: {
        desde: fechas.aISO(desde),
        hasta: fechas.aISO(hasta),
        lavados: filas.reduce((t, f) => t + f.completados, 0),
        gasto: filas.reduce((t, f) => t + f.gasto, 0),
        por_vehiculo: filas,
        pendiente_de_corte: { cantidad: pendiente._count || 0, total: pendiente._sum.precio_final || 0 }
      }
    });
  } catch (error) {
    responderError(res, error, 'al calcular el resumen de la flota');
  }
};

const misCortes = async (req, res) => {
  try {
    const cortes = await prisma.corteEmpresa.findMany({
      where: { id_cliente: req.empresa.id, estado: { not: 'anulado' } },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }]
    });
    res.json({ success: true, data: cortes });
  } catch (error) {
    responderError(res, error, 'al listar los cortes');
  }
};

const miCorteExcel = async (req, res) => {
  try {
    const corte = await corteService.detalle(req.params.id);
    // Un corte ajeno responde igual que uno inexistente
    if (corte.id_cliente !== req.empresa.id || corte.estado === 'anulado') {
      return res.status(404).json({ success: false, message: 'Corte no encontrado' });
    }
    await escribirExcel(res, corte);
  } catch (error) {
    responderError(res, error, 'al generar el Excel del corte');
  }
};

// Parqueaderos privados de la empresa (para reservar ahí)
const misSitios = async (req, res) => {
  try {
    const sitios = await prisma.estacionamiento.findMany({
      where: { id_cliente: req.empresa.id, tipo: 'privado', estado: 'activo' },
      select: {
        id: true, nombre: true, direccion: true, tipo: true, id_ciudad: true,
        ciudad: { select: { id: true, nombre: true } },
        horario_apertura: true, horario_cierre: true
      },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: sitios });
  } catch (error) {
    responderError(res, error, 'al listar los sitios de la empresa');
  }
};

// Precios pactados, para mostrar en la app lo mismo que se va a cobrar
const misTarifas = async (req, res) => {
  try {
    const tarifas = await prisma.tarifaEmpresa.findMany({
      where: { id_cliente: req.empresa.id, activo: true },
      select: { id_tipo_servicio: true, id_tipo_vehiculo: true, precio: true }
    });
    res.json({ success: true, data: tarifas });
  } catch (error) {
    responderError(res, error, 'al obtener las tarifas');
  }
};

module.exports = {
  listar, verTarifas, guardarTarifas, previo, listarCortes, cerrarCorte, verCorte,
  facturarCorte, pagarCorte, anularCorte, excelCorte,
  soloEmpresa, miResumen, misCortes, miCorteExcel, misSitios, misTarifas
};
