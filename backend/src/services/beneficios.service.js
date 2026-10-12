/**
 * Beneficios de los planes al reservar - Total Clean Car
 *
 * Dos clases de plan (ver model Plan):
 *   personal (VIP)  de una persona, pagado mes a mes. Solo rige en los meses
 *                   pagados: hace falta un PagoSuscripcion APROBADO del mes de
 *                   la reserva. Da N lavados incluidos al mes, un % de descuento
 *                   en lo demás (servicio no incluido y adicionales) y
 *                   prioridad: reservar con más anticipación y ocupar los cupos
 *                   apartados para VIP.
 *   sitio           de un edificio/condominio: N lavados al mes compartidos
 *                   entre quienes reservan en ese sitio aliado.
 *
 * Orden: primero el personal y después el del sitio. El recargo de un lavado a
 * domicilio se cobra siempre entero (es el traslado, no el lavado).
 */

const prisma = require('../db');
const fechas = require('../utils/fechas');
const parametros = require('../utils/parametros');

const redondear = (n) => Math.round(n * 100) / 100;

// "2026-10" del día de negocio
const periodoDe = (dia) => fechas.aISO(dia).slice(0, 7);

// [primer día, primer día del mes siguiente) del mes de `dia`
const mesDe = (dia) => {
  const desde = fechas.inicioMes(dia);
  return { desde, hasta: new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1)) };
};

const cubre = (plan, modalidad) => plan.modalidad === 'todas' || plan.modalidad === modalidad;

/**
 * Lavados del mes de `dia` que ya usaron la suscripción (sin contar los
 * cancelados, que devuelven el lavado). Antes el conteo de los planes de sitio
 * no tenía límite superior y sumaba también las reservas de meses siguientes.
 */
const usoDelMes = (idSuscripcion, dia, db = prisma) => {
  const { desde, hasta } = mesDe(dia);
  return db.reserva.count({
    where: { id_suscripcion: idSuscripcion, estado: { not: 'cancelada' }, fecha: { gte: desde, lt: hasta } }
  });
};

/**
 * Plan personal de la persona que rige para el mes de `dia`: el que tiene ESE
 * mes pagado. Lo pagado se respeta aunque después se haya cancelado el plan
 * (cancelar es dejar de renovar). null si ese mes no está pagado.
 */
const planPersonalVigente = async (idCliente, dia, db = prisma) => {
  if (!idCliente) return null;
  return db.suscripcion.findFirst({
    where: {
      id_cliente: idCliente,
      plan: { tipo: 'personal' },
      pagos: { some: { periodo: periodoDe(dia), estado: 'aprobado' } }
    },
    include: { plan: true },
    orderBy: { id: 'desc' }
  });
};

/**
 * Hasta cuántos días adelante puede reservar un cliente: el parámetro general
 * (14 por defecto) o el de su plan VIP si es mayor.
 */
const diasAnticipacion = async (vigente, db = prisma) => {
  const general = await parametros.leerEntero('reservas.dias_anticipacion', 14, { min: 1, max: 365 }, db);
  return Math.max(general, vigente?.plan?.dias_anticipacion || 0);
};

/**
 * Precio final de la reserva con los beneficios que correspondan.
 * @param vigente   plan personal vigente (planPersonalVigente) o null
 * @param sitio     el estacionamiento (para el plan de sitio) o null si es a domicilio
 * @returns { id_suscripcion, precio_servicio, precio_adicionales, notas[] }
 */
const aplicar = async ({ db = prisma, vigente, sitio, modalidad, dia, cotizacion }) => {
  let precioServicio = cotizacion.precio_servicio;
  let precioAdicionales = cotizacion.precio_adicionales;
  let idSuscripcion = null;
  const notas = [];

  if (vigente) {
    const plan = vigente.plan;
    const usados = cubre(plan, modalidad) ? await usoDelMes(vigente.id, dia, db) : Infinity;
    if (usados < plan.lavados_incluidos) {
      precioServicio = 0;
      idSuscripcion = vigente.id;
      notas.push(`incluido en el plan ${plan.nombre} (${usados + 1} de ${plan.lavados_incluidos} del mes)`);
    } else if (plan.descuento_pct > 0) {
      precioServicio = redondear(precioServicio * (1 - plan.descuento_pct / 100));
    }
    if (plan.descuento_pct > 0 && (precioServicio > 0 || precioAdicionales > 0)) {
      precioAdicionales = redondear(precioAdicionales * (1 - plan.descuento_pct / 100));
      notas.push(`descuento VIP ${plan.descuento_pct}%`);
    }
  }

  // Plan del edificio: si el servicio todavía se cobra y el sitio tiene uno con cupo
  if (precioServicio > 0 && sitio?.tipo === 'aliado') {
    const delSitio = await db.suscripcion.findFirst({
      where: { id_estacionamiento: sitio.id, estado: 'activa', plan: { tipo: 'sitio' } },
      include: { plan: true }
    });
    if (delSitio && cubre(delSitio.plan, modalidad) &&
        (await usoDelMes(delSitio.id, dia, db)) < delSitio.plan.lavados_incluidos) {
      precioServicio = 0;
      idSuscripcion = delSitio.id;
      notas.push(`cubierto por el plan: ${delSitio.plan.nombre}`);
    }
  }

  return { id_suscripcion: idSuscripcion, precio_servicio: precioServicio, precio_adicionales: precioAdicionales, notas };
};

module.exports = { periodoDe, mesDe, usoDelMes, planPersonalVigente, diasAnticipacion, aplicar, redondear };
