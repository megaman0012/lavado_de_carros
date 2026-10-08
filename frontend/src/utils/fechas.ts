// Fechas del negocio - Total Clean Car
//
// `Reserva.fecha` es un DÍA, no un instante: el backend lo guarda como medianoche
// UTC ("2026-09-27T00:00:00.000Z"). Hacer new Date(r.fecha).toLocaleDateString()
// en un navegador de Ecuador (UTC-5) lo convierte a las 19:00 del 26 y muestra
// el día anterior: ese era el bug "reservo el 27 y aparece el 26".
//
// Regla: para días de reserva usar SIEMPRE estas funciones. new Date(...) queda
// solo para instantes reales (fecha de un pago, de un cambio en el historial).

// Hoy según el reloj del usuario, "YYYY-MM-DD". (toISOString() daba el día UTC:
// desde las 19:00 el selector de fecha arrancaba en mañana.)
export const hoyISO = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "2026-09-27" o "2026-09-27T00:00:00.000Z" -> Date local de ese día (00:00 local)
const aDiaLocal = (valor: string): Date => {
  const [a, m, d] = valor.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
};

// dd/mm/aaaa
export const fechaCorta = (valor?: string | null): string => {
  if (!valor) return '';
  const [a, m, d] = valor.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

// "sábado 27 de septiembre"
export const fechaLarga = (valor?: string | null): string => {
  if (!valor) return '';
  const texto = aDiaLocal(valor).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Próximos n días desde hoy, para el selector tipo cartelera
export const proximosDias = (n: number): string[] => {
  const base = aDiaLocal(hoyISO());
  const pad = (x: number) => String(x).padStart(2, '0');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
};

// Partes para dibujar la tarjeta del día: { dow: 'sáb', dia: '27', mes: 'sep' }
export const partesDia = (valor: string) => {
  const d = aDiaLocal(valor);
  return {
    dow: d.toLocaleDateString('es-EC', { weekday: 'short' }).replace('.', ''),
    dia: String(d.getDate()),
    mes: d.toLocaleDateString('es-EC', { month: 'short' }).replace('.', '')
  };
};

// ---------------------------------------------------------------------------
// Meses — para el filtro de Reportes
// ---------------------------------------------------------------------------
// El valor que maneja <input type="month"> es "YYYY-MM". Todo lo de abajo trabaja
// con texto a propósito: construir un Date para después volver a formatearlo es
// justo por donde se cuela el corrimiento de un día.

/** Mes en curso, "YYYY-MM". */
export const mesActual = (): string => hoyISO().slice(0, 7);

/** Mueve n meses (puede ser negativo): desplazarMes('2026-01', -1) -> '2025-12'. */
export const desplazarMes = (mes: string, n: number): string => {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Primer y último día del mes, "YYYY-MM-DD", para mandar como desde/hasta. */
export const rangoMes = (mes: string): { desde: string; hasta: string } => {
  const [a, m] = mes.split('-').map(Number);
  // Día 0 del mes siguiente = último del actual; resuelve febrero y los bisiestos
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
};

/** "septiembre de 2026", con mayúscula inicial. */
export const nombreMes = (mes: string): string => {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/** Rango de los últimos n días terminando hoy, para las gráficas del Dashboard. */
export const ultimosDias = (n: number): { desde: string; hasta: string } => {
  const hasta = hoyISO();
  const [a, m, d] = hasta.split('-').map(Number);
  const inicio = new Date(a, m - 1, d - (n - 1));
  const pad = (x: number) => String(x).padStart(2, '0');
  return {
    desde: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}`,
    hasta
  };
};
