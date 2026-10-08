/**
 * utils/fechas — el módulo que resolvió el bug "reservé el 27 y aparece el 26".
 *
 * La convención es: un día de negocio se guarda como medianoche UTC. Si alguien
 * vuelve a construir fechas con `new Date(texto)` el error reaparece, así que
 * esta prueba está para que eso se note en el acto.
 */

const fechas = require('../../src/utils/fechas');

describe('fechaDia', () => {
  test('guarda el día como medianoche UTC, no como hora local', () => {
    const d = fechas.fechaDia('2026-09-27');
    expect(d.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  test('acepta un ISO completo y se queda con el día', () => {
    expect(fechas.aISO(fechas.fechaDia('2026-09-27T15:40:00.000Z'))).toBe('2026-09-27');
  });

  test('acepta un Date ya guardado (ida y vuelta sin corrimiento)', () => {
    const d = fechas.fechaDia('2026-01-01');
    expect(fechas.aISO(fechas.fechaDia(d))).toBe('2026-01-01');
  });

  test('rechaza lo que no es una fecha', () => {
    expect(fechas.fechaDia('')).toBeNull();
    expect(fechas.fechaDia(null)).toBeNull();
    expect(fechas.fechaDia('ayer')).toBeNull();
    expect(fechas.fechaDia('27-09-2026')).toBeNull();
  });

  test('rechaza un día que no existe en vez de correrlo al mes siguiente', () => {
    // new Date(2026, 1, 31) daría 3 de marzo: justo lo que no se quiere.
    expect(fechas.fechaDia('2026-02-31')).toBeNull();
    expect(fechas.fechaDia('2026-13-01')).toBeNull();
  });

  test('el 29 de febrero vale en año bisiesto y no en uno común', () => {
    expect(fechas.aISO(fechas.fechaDia('2028-02-29'))).toBe('2028-02-29');
    expect(fechas.fechaDia('2027-02-29')).toBeNull();
  });
});

describe('hoy y horaActual', () => {
  test('"hoy" es el día en Ecuador, no el del servidor en UTC', () => {
    // El contenedor corre en UTC: entre las 19:00 y la medianoche de Ecuador ya
    // está en el día siguiente. Esta prueba falla si alguien vuelve a usar la
    // fecha del proceso en lugar de APP_TZ.
    const enEcuador = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    expect(fechas.aISO(fechas.hoy())).toBe(enEcuador);
  });

  test('horaActual devuelve HH:mm en formato de 24 horas', () => {
    expect(fechas.horaActual()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe('sumarDias, inicioMes y formatoCorto', () => {
  test('sumar días cruza el fin de mes sin perder la medianoche UTC', () => {
    const d = fechas.sumarDias(fechas.fechaDia('2026-01-31'), 1);
    expect(d.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  test('restar días también funciona', () => {
    expect(fechas.aISO(fechas.sumarDias(fechas.fechaDia('2026-03-01'), -1))).toBe('2026-02-28');
  });

  test('inicioMes devuelve el primero del mes', () => {
    expect(fechas.aISO(fechas.inicioMes(fechas.fechaDia('2026-09-27')))).toBe('2026-09-01');
  });

  test('formatoCorto arma dd/mm/aaaa sin pasar por la zona del servidor', () => {
    expect(fechas.formatoCorto(fechas.fechaDia('2026-09-27'))).toBe('27/09/2026');
  });
});
