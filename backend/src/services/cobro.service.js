/**
 * Pago anticipado - Total Clean Car
 *
 * Regla del negocio: el lavado se paga ANTES de hacerlo. Un lavado de contado
 * con saldo no se puede iniciar, y un equipo a domicilio no sale ("en camino")
 * mientras su visita tenga lavados de contado sin pagar. Solo cuentan los pagos
 * APROBADOS: un comprobante en verificación todavía no es plata.
 *
 * No aplica a las empresas (forma_cobro 'credito': se cobran en su corte
 * mensual) ni a lo que sale $0 (incluido en un plan). Se puede apagar con el
 * parámetro reservas.pago_anticipado = 0.
 */

const prisma = require('../db');
const parametros = require('../utils/parametros');

const activo = async (db = prisma) =>
  (await parametros.leerEntero('reservas.pago_anticipado', 1, { min: 0, max: 1 }, db)) === 1;

// Saldo de una reserva (con sus pagos): precio menos lo aprobado
const saldo = (reserva) => {
  const pagado = (reserva.pagos || []).filter((p) => p.estado === 'aprobado').reduce((t, p) => t + p.monto, 0);
  return Math.max(Math.round(((reserva.precio_final || 0) - pagado) * 100) / 100, 0);
};

// ¿Esta reserva está impaga para la regla? (contado y con saldo)
const debe = (reserva) => reserva.forma_cobro !== 'credito' && saldo(reserva) > 0;

/**
 * Lanza 400 si hay que cobrar antes. `reservas` vienen con `pagos`.
 * `que` es el texto de la acción para el mensaje ("iniciar el lavado").
 */
const exigirPagado = async (reservas, que, db = prisma) => {
  if (!(await activo(db))) return;
  const impagas = reservas.filter((r) => !['cancelada', 'no_asistio', 'fallida'].includes(r.estado) && debe(r));
  if (impagas.length === 0) return;
  const total = impagas.reduce((t, r) => t + saldo(r), 0);
  throw Object.assign(new Error(
    `No se puede ${que}: falta el pago de $${total.toFixed(2)} (${impagas.map((r) => r.codigo).join(', ')}). ` +
    'El servicio se paga antes de realizarlo.'
  ), { statusCode: 400 });
};

module.exports = { activo, saldo, debe, exigirPagado };
