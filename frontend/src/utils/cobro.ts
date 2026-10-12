// Pago anticipado - Total Clean Car
import { Reserva } from '../types';

// Saldo de una reserva: precio menos los pagos APROBADOS (un comprobante en
// verificación todavía no cuenta)
export const saldoDe = (r: Pick<Reserva, 'precio_final' | 'pagos'>) => {
  const pagado = (r.pagos || []).filter((p) => p.estado === 'aprobado').reduce((t, p) => t + p.monto, 0);
  return Math.max(Math.round(((r.precio_final ?? 0) - pagado) * 100) / 100, 0);
};

// El lavado se paga antes de hacerlo, salvo las empresas (se cobran en su corte)
export const debeAntes = (r: Pick<Reserva, 'precio_final' | 'pagos' | 'forma_cobro' | 'estado'>) =>
  r.forma_cobro !== 'credito' && !['cancelada', 'no_asistio', 'fallida', 'completada'].includes(r.estado) && saldoDe(r) > 0;
