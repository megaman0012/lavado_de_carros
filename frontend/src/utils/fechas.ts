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
