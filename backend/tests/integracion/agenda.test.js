/**
 * Agenda: la "cartelera" que ve el cliente al elegir día y hora
 * (GET /api/agenda/disponibilidad) y la vista interna del día.
 *
 * Lo importante es que lo que se muestra y lo que se acepta al reservar sean la
 * misma regla: antes la disponibilidad miraba la capacidad del sitio y crear
 * reserva, la global, y un sitio podía decir "sin cupos" y aceptar igual.
 */

const bd = require('../ayudas/bd');
const fechasUtil = require('../../src/utils/fechas');
const agendaService = require('../../src/services/agenda.service');
const { app, request, entrar, con, enDias } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de agenda.\n');
}

d('Agenda', () => {
  let datos;
  let ana;
  let operador;
  let manana;

  beforeEach(async () => {
    datos = await bd.sembrar();
    [ana, operador] = await Promise.all([entrar('ana@prueba.local'), entrar('operador')]);
    manana = enDias(1);
  });
  afterAll(() => bd.desconectar());

  const disponibilidad = (params) =>
    request(app).get('/api/agenda/disponibilidad').query(params);

  describe('disponibilidad', () => {
    test('es pública: el visitante puede ver horarios antes de registrarse', async () => {
      const r = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(r.status).toBe(200);
    });

    test('las franjas empiezan en horarios fijos y cubren el horario del sitio', async () => {
      const r = await disponibilidad({
        fecha: manana, modalidad: 'expreso', duracion_min: 60, id_estacionamiento: datos.sitio.id
      });
      const { franjas, apertura, cierre } = r.body.data;
      expect(apertura).toBe('07:00');
      expect(cierre).toBe('18:00');
      expect(franjas[0].hora_inicio).toBe('07:00');
      // Abre 07:00, cierra 18:00, lavados de 1 h → 11 funciones, la última 17:00-18:00
      expect(franjas).toHaveLength(11);
      expect(franjas[franjas.length - 1].hora_fin).toBe('18:00');
    });

    test('un servicio más corto que la franja se ofrece cada media hora', async () => {
      const r = await disponibilidad({
        fecha: manana, modalidad: 'expreso', duracion_min: 30, id_estacionamiento: datos.sitio.id
      });
      const horas = r.body.data.franjas.map((f) => f.hora_inicio);
      expect(horas.slice(0, 3)).toEqual(['07:00', '07:30', '08:00']);
    });

    test('ninguna franja termina después del cierre', async () => {
      const r = await disponibilidad({
        fecha: manana, modalidad: 'expreso', duracion_min: 120, id_estacionamiento: datos.sitio.id
      });
      const pasadas = r.body.data.franjas.filter((f) => f.hora_fin > '18:00');
      expect(pasadas).toHaveLength(0);
    });

    test('reservar una franja la deja sin cupo para el siguiente', async () => {
      const antes = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(antes.body.data.franjas.find((f) => f.hora_inicio === '09:00').disponible).toBe(true);

      await con(request(app).post('/api/reservas'), ana.token).send({
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });

      const despues = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      const franja = despues.body.data.franjas.find((f) => f.hora_inicio === '09:00');
      expect(franja.ocupadas).toBe(1);
      expect(franja.cupos).toBe(0);
      expect(franja.disponible).toBe(false);
    });

    test('lo que la agenda marca sin cupo, crear reserva también lo rechaza', async () => {
      // Las dos cuentan con la misma función; esta prueba es la que avisa si
      // alguien vuelve a separarlas.
      await con(request(app).post('/api/reservas'), ana.token).send({
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });

      const r = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      const sinCupo = r.body.data.franjas.filter((f) => !f.disponible && !f.pasada).map((f) => f.hora_inicio);

      const beto = await entrar('beto@prueba.local');
      for (const hora of sinCupo) {
        const intento = await con(request(app).post('/api/reservas'), beto.token).send({
          id_vehiculo: datos.vehiculos.autoDeBeto.id,
          id_tipo_servicio: datos.servicios.expreso.id,
          id_estacionamiento: datos.sitio.id,
          fecha: manana,
          hora_inicio: hora
        });
        expect(intento.status).toBe(409);
      }
    });

    test('la capacidad sale de la configuración del sitio', async () => {
      const chico = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      const amplio = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitioAmplio.id });
      expect(chico.body.data.capacidad).toBe(1);
      expect(amplio.body.data.capacidad).toBe(2);
    });

    test('sin capacidad configurada, el expreso usa los lavadores activos de SU ciudad', async () => {
      await bd.prisma.estacionamiento.update({ where: { id: datos.sitio.id }, data: { capacidad_expreso: 0 } });
      const uno = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      // Hay dos lavadores en el sembrado, pero uno es de Quito: no cuenta en Guayaquil
      expect(uno.body.data.capacidad).toBe(1);

      await bd.prisma.lavador.create({ data: { nombre: 'Marta Lavadora', id_ciudad: datos.ciudades.guayaquil.id } });
      const dos = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(dos.body.data.capacidad).toBe(2);

      // Un lavador nuevo en Quito no le suma a Guayaquil
      await bd.prisma.lavador.create({ data: { nombre: 'Otro Quiteño', id_ciudad: datos.ciudades.quito.id } });
      const igual = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(igual.body.data.capacidad).toBe(2);
      const enQuito = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitioQuito.id });
      expect(enQuito.body.data.capacidad).toBe(2);
    });

    test('suspender a un lavador baja la capacidad del expreso', async () => {
      await bd.prisma.estacionamiento.update({ where: { id: datos.sitio.id }, data: { capacidad_expreso: 0 } });
      await bd.prisma.lavador.update({ where: { id: datos.lavador.id }, data: { estado: 'inactivo' } });
      const r = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(r.body.data.capacidad).toBe(0);
      expect(r.body.data.franjas.every((f) => !f.disponible)).toBe(true);
    });

    test('la capacidad de la profunda son las bahías disponibles del taller', async () => {
      const r = await disponibilidad({ fecha: manana, modalidad: 'profunda', duracion_min: 120, id_estacionamiento: datos.taller.id });
      expect(r.body.data.capacidad).toBe(1);

      await bd.prisma.plaza.updateMany({ where: { tipo: 'bahia_lavado' }, data: { estado: 'mantenimiento' } });
      const enMantenimiento = await disponibilidad({
        fecha: manana, modalidad: 'profunda', duracion_min: 120, id_estacionamiento: datos.taller.id
      });
      expect(enMantenimiento.body.data.capacidad).toBe(0);
    });

    test('las bahías de un taller de otra ciudad no le suman a este', async () => {
      const tallerQuito = await bd.prisma.estacionamiento.create({
        data: { nombre: 'Taller Quito', id_ciudad: datos.ciudades.quito.id, tipo: 'taller', admite_expreso: false }
      });
      await bd.prisma.plaza.createMany({
        data: [1, 2, 3].map((n) => ({ id_estacionamiento: tallerQuito.id, codigo: `B-0${n}`, tipo: 'bahia_lavado' }))
      });
      const gye = await disponibilidad({ fecha: manana, modalidad: 'profunda', duracion_min: 120, id_estacionamiento: datos.taller.id });
      const uio = await disponibilidad({ fecha: manana, modalidad: 'profunda', duracion_min: 120, id_estacionamiento: tallerQuito.id });
      expect(gye.body.data.capacidad).toBe(1);
      expect(uio.body.data.capacidad).toBe(3);
    });

    test('profunda sin taller, o en un sitio que no es taller: 400', async () => {
      const sinSitio = await disponibilidad({ fecha: manana, modalidad: 'profunda', duracion_min: 120 });
      expect(sinSitio.status).toBe(400);
      const enEdificio = await disponibilidad({
        fecha: manana, modalidad: 'profunda', duracion_min: 120, id_estacionamiento: datos.sitio.id
      });
      expect(enEdificio.status).toBe(400);
      const expresoEnTaller = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.taller.id });
      expect(expresoEnTaller.status).toBe(400);
    });

    test('un día pasado no tiene funciones a la venta', async () => {
      const r = await disponibilidad({ fecha: enDias(-1), modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(r.body.data.franjas.every((f) => f.pasada && !f.disponible)).toBe(true);
    });

    test('hoy, las franjas que ya empezaron se marcan como pasadas', async () => {
      const ahora = agendaService.aMinutos(fechasUtil.horaActual());
      const r = await disponibilidad({ fecha: enDias(0), modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      for (const f of r.body.data.franjas) {
        const empezada = agendaService.aMinutos(f.hora_inicio) <= ahora;
        expect(f.pasada).toBe(empezada);
        if (empezada) expect(f.disponible).toBe(false);
      }
    });

    test('faltando fecha o modalidad: 400', async () => {
      expect((await disponibilidad({ modalidad: 'expreso' })).status).toBe(400);
      expect((await disponibilidad({ fecha: manana })).status).toBe(400);
    });

    test('modalidad inventada: 400', async () => {
      expect((await disponibilidad({ fecha: manana, modalidad: 'turbo' })).status).toBe(400);
    });

    test('fecha inválida: 400', async () => {
      expect((await disponibilidad({ fecha: '2026-02-31', modalidad: 'expreso' })).status).toBe(400);
    });

    test('estacionamiento inexistente: 404', async () => {
      const r = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: 9999 });
      expect(r.status).toBe(404);
    });
  });

  describe('vista del día y bloqueos', () => {
    test('el personal interno ve las asignaciones del día', async () => {
      await con(request(app).post('/api/reservas'), ana.token).send({
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });

      const r = await con(request(app).get(`/api/agenda?fecha=${manana}`), operador.token);
      expect(r.status).toBe(200);
      expect(r.body.data.asignaciones).toHaveLength(1);
      expect(r.body.data.asignaciones[0].reserva.vehiculo.placa).toBe('ABC-1234');
    });

    test('el cliente no accede a la vista interna del día', async () => {
      expect((await con(request(app).get(`/api/agenda?fecha=${manana}`), ana.token)).status).toBe(403);
      expect((await request(app).get(`/api/agenda?fecha=${manana}`)).status).toBe(401);
    });

    test('un bloqueo manual aparece en la agenda y se puede quitar', async () => {
      const bloqueo = await con(request(app).post('/api/agenda/bloqueos'), operador.token)
        .send({ fecha: manana, hora_inicio: '09:00', hora_fin: '11:00', nota: 'Corte de agua' });
      expect(bloqueo.status).toBe(201);

      const conBloqueo = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(conBloqueo.body.data.franjas.find((f) => f.hora_inicio === '10:00').disponible).toBe(false);

      await con(request(app).delete(`/api/agenda/bloqueos/${bloqueo.body.data.id}`), operador.token);
      const sinBloqueo = await disponibilidad({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(sinBloqueo.body.data.franjas.find((f) => f.hora_inicio === '10:00').disponible).toBe(true);
    });
  });
});
