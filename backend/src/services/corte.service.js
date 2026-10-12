/**
 * Cortes mensuales de empresas - Total Clean Car
 *
 * Una empresa no paga lavado por lavado: sus reservas nacen "a crédito"
 * (Reserva.forma_cobro = 'credito') y se cobran juntas en un corte mensual. La
 * factura electrónica la emite el sistema contable; acá se arma el corte, se
 * exporta, y se registra el número de factura y el pago.
 *
 * Qué entra en un corte del período P (por ejemplo "2026-10"):
 *   - lavados COMPLETADOS a crédito de la empresa, y visitas a domicilio
 *     FALLIDAS (se cobra el cargo de visita),
 *   - con fecha hasta el último día de P,
 *   - que todavía no estén en otro corte.
 * O sea que un lavado de septiembre que se completó tarde, o que quedó afuera
 * de un corte anulado, entra en el siguiente: ninguno se pierde ni se cobra dos
 * veces. Los cancelados y los "no asistió" no se cobran.
 *
 * Ciclo: cerrado → facturado → pagado. Un corte cerrado o facturado se puede
 * anular (los lavados quedan libres para otro corte); uno pagado, no.
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');

const error = (statusCode, mensaje) => Object.assign(new Error(mensaje), { statusCode });

// "2026-10" → { desde: 2026-10-01, hasta: 2026-10-31 } en días de negocio
const rangoPeriodo = (periodo) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '')) throw error(400, 'Período inválido (formato AAAA-MM)');
  const desde = fechas.fechaDia(`${periodo}-01`);
  const siguiente = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1));
  return { desde, hasta: fechas.sumarDias(siguiente, -1) };
};

const incluirDetalle = {
  vehiculo: { select: { placa: true, marca: true, modelo: true, tipoVehiculo: { select: { nombre: true } } } },
  tipoServicio: { select: { nombre: true, modalidad: true } },
  estacionamiento: { select: { nombre: true, ciudad: { select: { nombre: true } } } },
  ciudad: { select: { nombre: true } },
  visita: { select: { direccion: true, recargo: true, sector: { select: { nombre: true } } } },
  adicionales: { select: { nombre: true, precio: true } }
};

// Una fila del detalle, igual para la pantalla y para el Excel
const fila = (r) => ({
  id: r.id,
  codigo: r.codigo,
  fecha: fechas.aISO(r.fecha),
  hora: r.hora_inicio,
  placa: r.vehiculo?.placa || '',
  vehiculo: [r.vehiculo?.marca, r.vehiculo?.modelo].filter(Boolean).join(' '),
  tipo_vehiculo: r.vehiculo?.tipoVehiculo?.nombre || '',
  servicio: r.tipoServicio?.nombre || '',
  adicionales: (r.adicionales || []).map((a) => a.nombre).join(', '),
  sitio: r.estacionamiento?.nombre || (r.visita ? `A domicilio · ${r.visita.sector.nombre}` : ''),
  ciudad: r.ciudad?.nombre || '',
  // El cargo de una visita fallida va con su nota; un lavado a domicilio, con su recargo
  nota: r.estado === 'fallida' ? 'Visita fallida (cargo)' : r.visita?.recargo ? `incluye recargo $${r.visita.recargo.toFixed(2)}` : '',
  total: r.precio_final || 0
});

const totalizar = (filas) => ({
  cantidad: filas.length,
  total: Math.round(filas.reduce((t, f) => t + f.total, 0) * 100) / 100
});

const empresaOError = async (idCliente, db = prisma) => {
  const empresa = await db.cliente.findUnique({ where: { id: parseInt(idCliente) || 0 } });
  if (!empresa || empresa.tipo !== 'empresa') throw error(404, 'Empresa no encontrada');
  return empresa;
};

// Lavados que entrarían hoy en el corte del período
const pendientes = (idCliente, hasta, db = prisma) =>
  db.reserva.findMany({
    where: {
      id_cliente: idCliente,
      forma_cobro: 'credito',
      id_corte: null,
      estado: { in: ['completada', 'fallida'] },
      fecha: { lte: hasta }
    },
    include: incluirDetalle,
    orderBy: [{ fecha: 'asc' }, { hora_inicio: 'asc' }]
  });

/**
 * Vista previa del corte: lo que se cerraría ahora, sin tocar nada. Avisa
 * además cuántos lavados del período siguen sin completar (entrarán en un
 * corte posterior cuando se completen).
 */
const previsualizar = async (idCliente, periodo) => {
  const empresa = await empresaOError(idCliente);
  const { desde, hasta } = rangoPeriodo(periodo);
  const [reservas, sinCompletar, existente] = await Promise.all([
    pendientes(empresa.id, hasta),
    prisma.reserva.count({
      where: {
        id_cliente: empresa.id, forma_cobro: 'credito', id_corte: null,
        estado: { in: ['solicitada', 'confirmada', 'en_proceso'] },
        fecha: { gte: desde, lte: hasta }
      }
    }),
    prisma.corteEmpresa.findFirst({ where: { id_cliente: empresa.id, periodo, estado: { not: 'anulado' } } })
  ]);
  const filas = reservas.map(fila);
  return {
    periodo,
    desde: fechas.aISO(desde),
    hasta: fechas.aISO(hasta),
    ...totalizar(filas),
    de_periodos_anteriores: reservas.filter((r) => r.fecha < desde).length,
    sin_completar: sinCompletar,
    corte_existente: existente ? { id: existente.id, codigo: existente.codigo, estado: existente.estado } : null,
    filas
  };
};

/**
 * Cierra el corte: congela los lavados pendientes y su total. Uno por empresa
 * y período (salvo anulados). Serializable: dos personas cerrando a la vez no
 * pueden meter el mismo lavado en dos cortes.
 */
const cerrar = async ({ idCliente, periodo, notas, usuario }) => {
  const empresa = await empresaOError(idCliente);
  const { desde, hasta } = rangoPeriodo(periodo);
  if (desde > fechas.hoy()) throw error(400, 'No se puede cerrar un período que todavía no empezó');

  return prisma.$transaction(async (tx) => {
    const existente = await tx.corteEmpresa.findFirst({
      where: { id_cliente: empresa.id, periodo, estado: { not: 'anulado' } }
    });
    if (existente) throw error(409, `Ese período ya tiene el corte ${existente.codigo} (${existente.estado})`);

    const reservas = await pendientes(empresa.id, hasta, tx);
    if (reservas.length === 0) throw error(400, 'No hay lavados completados a crédito para cortar');
    const { cantidad, total } = totalizar(reservas.map(fila));

    // El código dice mes y empresa; si hubo cortes anulados del mismo mes, lleva sufijo
    const previos = await tx.corteEmpresa.count({ where: { id_cliente: empresa.id, periodo } });
    const codigo = `CORTE-${periodo}-E${String(empresa.id).padStart(4, '0')}${previos ? `-${previos + 1}` : ''}`;

    const corte = await tx.corteEmpresa.create({
      data: {
        codigo, id_cliente: empresa.id, periodo, desde, hasta, cantidad, total,
        notas: notas?.trim() || null, usuario
      }
    });
    await tx.reserva.updateMany({ where: { id: { in: reservas.map((r) => r.id) } }, data: { id_corte: corte.id } });
    await tx.historialReserva.createMany({
      data: reservas.map((r) => ({
        id_reserva: r.id, accion: 'corte', estado_anterior: r.estado, estado_nuevo: r.estado,
        motivo: `Incluido en el corte ${codigo}`, usuario
      }))
    });
    return corte;
  }, { isolationLevel: 'Serializable' });
};

const corteOError = async (id, db = prisma) => {
  const corte = await db.corteEmpresa.findUnique({ where: { id: parseInt(id) || 0 } });
  if (!corte) throw error(404, 'Corte no encontrado');
  return corte;
};

// Detalle completo de un corte (pantalla y Excel)
const detalle = async (id) => {
  const corte = await prisma.corteEmpresa.findUnique({
    where: { id: parseInt(id) || 0 },
    include: {
      cliente: { select: { id: true, nombre: true, ruc: true, razon_social: true, email_facturacion: true, direccion_fiscal: true } },
      reservas: { include: incluirDetalle, orderBy: [{ fecha: 'asc' }, { hora_inicio: 'asc' }] }
    }
  });
  if (!corte) throw error(404, 'Corte no encontrado');
  const { reservas, ...resto } = corte;
  return { ...resto, filas: reservas.map(fila) };
};

// cerrado → facturado: se anota el número que dio el sistema contable
const facturar = async (id, { numero_factura, fecha_factura }) => {
  const corte = await corteOError(id);
  if (corte.estado !== 'cerrado') throw error(400, `El corte está "${corte.estado}": solo se factura uno cerrado`);
  if (!numero_factura?.trim()) throw error(400, 'Indique el número de factura');
  return prisma.corteEmpresa.update({
    where: { id: corte.id },
    data: {
      estado: 'facturado',
      numero_factura: numero_factura.trim(),
      fecha_factura: (fecha_factura && fechas.fechaDia(fecha_factura)) || new Date()
    }
  });
};

/**
 * facturado → pagado. Además registra un pago aprobado por cada lavado del
 * corte (por su saldo), así los reportes de "cobrado" y el saldo de cada
 * reserva cuadran igual que con los clientes que pagan al contado.
 */
const pagar = async (id, { fecha_pago, referencia }, usuario) => {
  const corte = await corteOError(id);
  if (corte.estado !== 'facturado') throw error(400, `El corte está "${corte.estado}": primero hay que facturarlo`);
  const fechaPago = (fecha_pago && fechas.fechaDia(fecha_pago)) || new Date();
  const ref = `${corte.codigo}${referencia?.trim() ? ` · ${referencia.trim()}` : ''}`;

  return prisma.$transaction(async (tx) => {
    const reservas = await tx.reserva.findMany({ where: { id_corte: corte.id }, include: { pagos: true } });
    for (const r of reservas) {
      const pagado = r.pagos.filter((p) => p.estado === 'aprobado').reduce((t, p) => t + p.monto, 0);
      const saldo = Math.round(((r.precio_final || 0) - pagado) * 100) / 100;
      if (saldo <= 0) continue;
      await tx.pago.create({
        data: { id_reserva: r.id, monto: saldo, metodo: 'transferencia', estado: 'aprobado', referencia: ref, fecha_pago: fechaPago }
      });
      await tx.historialReserva.create({
        data: { id_reserva: r.id, accion: 'pago_corte', motivo: `Pagado en el corte ${corte.codigo}: $${saldo.toFixed(2)}`, usuario }
      });
    }
    return tx.corteEmpresa.update({
      where: { id: corte.id },
      data: { estado: 'pagado', fecha_pago: fechaPago, referencia_pago: referencia?.trim() || null }
    });
  }, { timeout: 30000 }); // un pago por lavado: un corte grande pasa de los 5 s por defecto
};

// Anula un corte cerrado o facturado: sus lavados vuelven a quedar pendientes
const anular = async (id, { motivo }, usuario) => {
  const corte = await corteOError(id);
  if (!['cerrado', 'facturado'].includes(corte.estado)) {
    throw error(400, `Un corte "${corte.estado}" no se puede anular`);
  }
  if (!motivo?.trim()) throw error(400, 'Indique el motivo de la anulación');
  return prisma.$transaction(async (tx) => {
    const reservas = await tx.reserva.findMany({ where: { id_corte: corte.id }, select: { id: true, estado: true } });
    await tx.reserva.updateMany({ where: { id_corte: corte.id }, data: { id_corte: null } });
    await tx.historialReserva.createMany({
      data: reservas.map((r) => ({
        id_reserva: r.id, accion: 'corte_anulado', estado_anterior: r.estado, estado_nuevo: r.estado,
        motivo: `Corte ${corte.codigo} anulado: ${motivo.trim()}`, usuario
      }))
    });
    return tx.corteEmpresa.update({
      where: { id: corte.id },
      data: { estado: 'anulado', notas: [corte.notas, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' · ') }
    });
  });
};

module.exports = { rangoPeriodo, previsualizar, cerrar, detalle, facturar, pagar, anular, fila, incluirDetalle };
