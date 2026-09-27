/**
 * Fechas de negocio - Total Clean Car
 *
 * Una reserva es para un DÍA (columna `fecha`) y una hora "HH:mm" en texto; no
 * es un instante. Convención: el día se guarda como medianoche UTC
 * (2026-09-27 -> 2026-09-27T00:00:00.000Z), sin importar la zona del servidor.
 *
 * El error "reservo el 27 y aparece el 26" venía de mezclar esa convención con
 * la zona local: el navegador (UTC-5) convertía la medianoche UTC a las 19:00
 * del día anterior. Por eso:
 *   - el backend construye los días SOLO con fechaDia() de este módulo;
 *   - "hoy" y "ahora" se calculan en la zona del negocio (APP_TZ), no en la del
 *     contenedor, que corre en UTC: entre las 19:00 y las 24:00 de Ecuador el
 *     contenedor ya está en el día siguiente.
 */

const APP_TZ = process.env.APP_TZ || 'America/Guayaquil';

// "YYYY-MM-DD" (o un ISO completo) -> Date a medianoche UTC de ese día.
// Devuelve null si el texto no es una fecha válida.
const fechaDia = (valor) => {
  if (valor instanceof Date) valor = valor.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Rechaza fechas imposibles (2026-02-31 se convertiría en marzo)
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
};

// Día guardado -> "YYYY-MM-DD"
const aISO = (dia) => new Date(dia).toISOString().slice(0, 10);

// Partes de "ahora" en la zona del negocio
const partesAhora = () => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  return Object.fromEntries(partes.map((p) => [p.type, p.value]));
};

// Hoy en la zona del negocio, como día guardable (medianoche UTC)
const hoy = () => {
  const p = partesAhora();
  return fechaDia(`${p.year}-${p.month}-${p.day}`);
};

// Hora actual "HH:mm" en la zona del negocio
const horaActual = () => {
  const p = partesAhora();
  return `${p.hour}:${p.minute}`;
};

// Suma días a un día guardado
const sumarDias = (dia, n) => new Date(dia.getTime() + n * 86400000);

// Primer día del mes de un día guardado
const inicioMes = (dia) => new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));

// "dd/mm/aaaa" para correos, SMS y PDF (sin pasar por la zona del servidor)
const formatoCorto = (dia) => {
  const [a, m, d] = aISO(dia).split('-');
  return `${d}/${m}/${a}`;
};

module.exports = { APP_TZ, fechaDia, aISO, hoy, horaActual, sumarDias, inicioMes, formatoCorto };
