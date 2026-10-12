/**
 * services/agenda.service — el cálculo de solapamiento y de ocupación.
 *
 * Es la lógica más delicada del sistema: si se equivoca, o se venden dos veces
 * la misma franja, o se rechazan reservas que sí entraban. Acá se prueba sin
 * base de datos, pasándole las asignaciones ya leídas (el mismo parámetro que
 * usa disponibilidadDia para no consultar una vez por franja).
 */

const agenda = require('../../src/services/agenda.service');

describe('aMinutos / aHHMM', () => {
  test('convierte en los dos sentidos', () => {
    expect(agenda.aMinutos('00:00')).toBe(0);
    expect(agenda.aMinutos('07:30')).toBe(450);
    expect(agenda.aMinutos('23:59')).toBe(1439);
    expect(agenda.aHHMM(450)).toBe('07:30');
    expect(agenda.aHHMM(0)).toBe('00:00');
    expect(agenda.aHHMM(545)).toBe('09:05'); // rellena con cero a la izquierda
  });

  test('ida y vuelta devuelve lo mismo', () => {
    for (const h of ['07:00', '08:45', '13:15', '18:00']) {
      expect(agenda.aHHMM(agenda.aMinutos(h))).toBe(h);
    }
  });
});

describe('solapan', () => {
  // Los intervalos son [inicio, fin): el que termina justo cuando empieza el
  // otro NO se solapa. De eso depende que 07:00-08:00 y 08:00-09:00 convivan.
  test('dos franjas pegadas no se solapan', () => {
    expect(agenda.solapan('07:00', '08:00', '08:00', '09:00')).toBe(false);
    expect(agenda.solapan('08:00', '09:00', '07:00', '08:00')).toBe(false);
  });

  test('un minuto de cruce ya es solape', () => {
    expect(agenda.solapan('07:00', '08:00', '07:59', '09:00')).toBe(true);
    expect(agenda.solapan('07:00', '08:00', '06:00', '07:01')).toBe(true);
  });

  test('una franja contenida en otra se solapa', () => {
    expect(agenda.solapan('07:00', '10:00', '08:00', '09:00')).toBe(true);
    expect(agenda.solapan('08:00', '09:00', '07:00', '10:00')).toBe(true);
  });

  test('franjas idénticas se solapan', () => {
    expect(agenda.solapan('07:00', '08:00', '07:00', '08:00')).toBe(true);
  });

  test('franjas separadas no se solapan', () => {
    expect(agenda.solapan('07:00', '08:00', '09:00', '10:00')).toBe(false);
  });
});

describe('contarOcupaciones', () => {
  const fecha = '2026-09-27';
  // Una asignación tal como sale de la agenda: con su reserva o sin ella (bloqueo).
  const asignacion = (hora_inicio, hora_fin, reserva, alcanceBloqueo = {}) => ({
    hora_inicio, hora_fin, reserva: reserva || null, id_ciudad: null, id_estacionamiento: null, ...alcanceBloqueo
  });
  const expresoEn = (id_estacionamiento) => ({ modalidad: 'expreso', id_estacionamiento });
  // Sitios: 1 y 2 en la ciudad 10; 3 en la ciudad 20; 5 es el taller de la ciudad 10
  const sitio = (id, id_ciudad = 10) => ({ id, id_ciudad });

  const contar = (args, asignaciones) =>
    agenda.contarOcupaciones({ fecha, asignaciones, ...args });

  test('cuenta solo lo que se cruza con la franja pedida', async () => {
    const asignaciones = [
      asignacion('07:00', '08:00', expresoEn(1)),
      asignacion('08:00', '09:00', expresoEn(1)), // pegada: no cuenta
      asignacion('09:00', '10:00', expresoEn(1))
    ];
    const n = await contar(
      { horaInicio: '07:00', horaFin: '08:00', modalidad: 'expreso', estacionamiento: sitio(1) },
      asignaciones
    );
    expect(n).toBe(1);
  });

  test('el expreso de otro sitio no ocupa cupo en este', async () => {
    // Un lavado expreso se hace en el estacionamiento del cliente: lo que pasa
    // en otro edificio no le quita cupo a este.
    const asignaciones = [
      asignacion('07:00', '08:00', expresoEn(1)),
      asignacion('07:00', '08:00', expresoEn(2))
    ];
    const enUno = await contar(
      { horaInicio: '07:00', horaFin: '08:00', modalidad: 'expreso', estacionamiento: sitio(1) },
      asignaciones
    );
    expect(enUno).toBe(1);
  });

  test('la profunda cuenta las reservas de SU taller, no las de otro', async () => {
    // Antes el taller era uno solo y la profunda contaba global: con un taller
    // por ciudad, lo de Quito no puede llenar el de Guayaquil.
    const asignaciones = [
      asignacion('07:00', '09:00', { modalidad: 'profunda', id_estacionamiento: 5 }),
      asignacion('07:00', '09:00', { modalidad: 'profunda', id_estacionamiento: 6 })
    ];
    const n = await contar(
      { horaInicio: '08:00', horaFin: '10:00', modalidad: 'profunda', estacionamiento: sitio(5) },
      asignaciones
    );
    expect(n).toBe(1);
  });

  test('una modalidad no le quita cupo a la otra', async () => {
    const asignaciones = [asignacion('07:00', '09:00', { modalidad: 'profunda', id_estacionamiento: 1 })];
    const n = await contar(
      { horaInicio: '07:00', horaFin: '08:00', modalidad: 'expreso', estacionamiento: sitio(1) },
      asignaciones
    );
    expect(n).toBe(0);
  });

  test('un bloqueo nacional ocupa en las dos modalidades y en todos los sitios', async () => {
    const asignaciones = [asignacion('07:00', '12:00', null)];
    const expreso = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'expreso', estacionamiento: sitio(3, 20) },
      asignaciones
    );
    const profunda = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'profunda', estacionamiento: sitio(5) },
      asignaciones
    );
    expect(expreso).toBe(1);
    expect(profunda).toBe(1);
  });

  test('un bloqueo de ciudad ocupa en sus sitios y no en los de otra ciudad', async () => {
    const asignaciones = [asignacion('07:00', '12:00', null, { id_ciudad: 10 })];
    const enSuCiudad = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'expreso', estacionamiento: sitio(2, 10) },
      asignaciones
    );
    const enOtra = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'expreso', estacionamiento: sitio(3, 20) },
      asignaciones
    );
    expect(enSuCiudad).toBe(1);
    expect(enOtra).toBe(0);
  });

  test('un bloqueo de sitio ocupa solo en ese sitio', async () => {
    const asignaciones = [asignacion('07:00', '12:00', null, { id_ciudad: 10, id_estacionamiento: 1 })];
    const enEse = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'expreso', estacionamiento: sitio(1) },
      asignaciones
    );
    const enOtroDeLaCiudad = await contar(
      { horaInicio: '08:00', horaFin: '09:00', modalidad: 'expreso', estacionamiento: sitio(2) },
      asignaciones
    );
    expect(enEse).toBe(1);
    expect(enOtroDeLaCiudad).toBe(0);
  });

  test('sin asignaciones el conteo es cero', async () => {
    const n = await contar(
      { horaInicio: '07:00', horaFin: '08:00', modalidad: 'expreso', estacionamiento: sitio(1) },
      []
    );
    expect(n).toBe(0);
  });
});

describe('validarSitio', () => {
  const aliado = { estado: 'activo', tipo: 'aliado', admite_expreso: true };
  const taller = { estado: 'activo', tipo: 'taller', admite_expreso: false };

  test('el expreso va a un sitio aliado y la profunda a un taller', () => {
    expect(() => agenda.validarSitio(aliado, 'expreso')).not.toThrow();
    expect(() => agenda.validarSitio(taller, 'profunda')).not.toThrow();
  });

  test('la profunda no se reserva en un edificio ni el expreso en un taller', () => {
    expect(() => agenda.validarSitio(aliado, 'profunda')).toThrow(/taller/);
    expect(() => agenda.validarSitio(taller, 'expreso')).toThrow(/no admite/);
  });

  test('un sitio inactivo o que no admite expreso se rechaza con 400', () => {
    let error;
    try { agenda.validarSitio({ ...aliado, estado: 'inactivo' }, 'expreso'); } catch (e) { error = e; }
    expect(error.statusCode).toBe(400);
    expect(() => agenda.validarSitio({ ...aliado, admite_expreso: false }, 'expreso')).toThrow(/no admite/);
  });
});
