/**
 * Reservas (POST/PUT /api/reservas) — el corazón del negocio.
 *
 * Lo que más importa acá es que una franja no se venda dos veces. La regla vive
 * en una transacción serializable dentro de reserva.controller, y es el tipo de
 * código que se rompe sin que nadie lo note hasta que dos clientes se presentan
 * a la misma hora.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con, enDias } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de reservas.\n');
}

d('Reservas', () => {
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

  // Reserva expreso estándar de Ana en el sitio de capacidad 1
  const reservaBase = (extra = {}) => ({
    id_vehiculo: datos.vehiculos.autoDeAna.id,
    id_tipo_servicio: datos.servicios.expreso.id,
    id_estacionamiento: datos.sitio.id,
    fecha: manana,
    hora_inicio: '09:00',
    ...extra
  });

  const crear = (token, cuerpo) => con(request(app).post('/api/reservas'), token).send(cuerpo);

  describe('crear', () => {
    test('el cliente reserva y recibe su boleto con código, horario y precio', async () => {
      const r = await crear(ana.token, reservaBase());
      expect(r.status).toBe(201);
      expect(r.body.data.codigo).toMatch(/^RES-\d{4}-\d{5}$/);
      expect(r.body.data.estado).toBe('solicitada');
      expect(r.body.data.hora_inicio).toBe('09:00');
      expect(r.body.data.hora_fin).toBe('10:00'); // 60 min del servicio para "liviano"
      expect(r.body.data.precio_final).toBe(10);
    });

    test('la fecha que vuelve es la que se pidió, sin corrimiento de un día', async () => {
      // La regresión que motivó utils/fechas: el día se guarda como medianoche
      // UTC y no debe moverse al convertirlo de vuelta.
      const r = await crear(ana.token, reservaBase());
      expect(r.body.data.fecha.slice(0, 10)).toBe(manana);
    });

    test('los adicionales suman al precio y alargan la franja', async () => {
      const r = await crear(ana.token, reservaBase({ adicionales: [datos.adicionales.encerado.id] }));
      expect(r.status).toBe(201);
      expect(r.body.data.precio_final).toBe(15);   // 10 + 5
      expect(r.body.data.hora_fin).toBe('10:30');  // 60 + 30 min
      expect(r.body.data.adicionales).toHaveLength(1);
    });

    test('el adicional guarda una copia de su nombre y precio', async () => {
      // Si mañana sube el precio del encerado, la reserva ya hecha no cambia.
      const r = await crear(ana.token, reservaBase({ adicionales: [datos.adicionales.encerado.id] }));
      await bd.prisma.servicioAdicional.update({ where: { id: datos.adicionales.encerado.id }, data: { precio: 99 } });

      const traida = await con(request(app).get(`/api/reservas/${r.body.data.id}`), ana.token);
      expect(traida.body.data.adicionales[0].precio).toBe(5);
      expect(traida.body.data.adicionales[0].nombre).toBe('Encerado');
    });

    test('se genera la asignación de agenda que bloquea la franja', async () => {
      const r = await crear(ana.token, reservaBase());
      const asignaciones = await bd.prisma.asignacionAgenda.findMany({ where: { id_reserva: r.body.data.id } });
      expect(asignaciones).toHaveLength(1);
      expect(asignaciones[0].hora_inicio).toBe('09:00');
      expect(asignaciones[0].hora_fin).toBe('10:00');
    });

    test('queda registrada la creación en el historial', async () => {
      const r = await crear(ana.token, reservaBase());
      const historial = await bd.prisma.historialReserva.findMany({ where: { id_reserva: r.body.data.id } });
      expect(historial).toHaveLength(1);
      expect(historial[0].accion).toBe('creacion');
      expect(historial[0].usuario).toBe('ana@prueba.local');
    });

    test('los códigos son correlativos', async () => {
      const uno = await crear(ana.token, reservaBase({ hora_inicio: '09:00' }));
      const dos = await crear(ana.token, reservaBase({ hora_inicio: '11:00' }));
      expect(uno.body.data.codigo.endsWith('00001')).toBe(true);
      expect(dos.body.data.codigo.endsWith('00002')).toBe(true);
    });
  });

  describe('validaciones', () => {
    test('no se puede reservar el vehículo de otro cliente', async () => {
      const r = await crear(ana.token, reservaBase({ id_vehiculo: datos.vehiculos.autoDeBeto.id }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/veh[íi]culo/i);
    });

    test('un servicio sin tarifa para ese tipo de vehículo no se ofrece', async () => {
      // La moto quedó sin precio de lavado expreso: no se le puede vender.
      const r = await crear(ana.token, reservaBase({ id_vehiculo: datos.vehiculos.motoDeAna.id }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/no está disponible/i);
    });

    test('un vehículo sin tipo no puede reservar, y el mensaje dice qué hacer', async () => {
      await bd.prisma.vehiculo.update({
        where: { id: datos.vehiculos.autoDeAna.id }, data: { id_tipo_vehiculo: null }
      });
      const r = await crear(ana.token, reservaBase());
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/tipo/i);
    });

    test('no se reserva en fechas pasadas', async () => {
      const r = await crear(ana.token, reservaBase({ fecha: enDias(-1) }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/pasad/i);
    });

    test('una fecha inválida se rechaza en vez de interpretarse', async () => {
      expect((await crear(ana.token, reservaBase({ fecha: '2026-02-31' }))).status).toBe(400);
      expect((await crear(ana.token, reservaBase({ fecha: 'mañana' }))).status).toBe(400);
    });

    test('la hora tiene que venir en formato HH:mm', async () => {
      expect((await crear(ana.token, reservaBase({ hora_inicio: '9am' }))).status).toBe(400);
      expect((await crear(ana.token, reservaBase({ hora_inicio: '9:00' }))).status).toBe(400);
    });

    test('faltando datos obligatorios: 400', async () => {
      const r = await crear(ana.token, { fecha: manana, hora_inicio: '09:00' });
      expect(r.status).toBe(400);
    });

    test('un servicio que no termina antes del cierre no entra', async () => {
      // El sitio cierra a las 18:00 y el lavado dura una hora: 17:30 no cabe.
      const r = await crear(ana.token, reservaBase({ hora_inicio: '17:30' }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/horario de atención/i);
    });

    test('tampoco antes de abrir', async () => {
      const r = await crear(ana.token, reservaBase({ hora_inicio: '06:00' }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/horario de atención/i);
    });

    test('el servicio expreso exige estacionamiento', async () => {
      const r = await crear(ana.token, reservaBase({ id_estacionamiento: undefined }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/estacionamiento/i);
    });

    test('un cliente suspendido no puede reservar', async () => {
      // Se suspende solo la ficha para que el token siga siendo válido y la
      // negativa venga de la regla de negocio, no del middleware de sesión.
      const beto = await entrar('beto@prueba.local');
      await bd.prisma.cliente.update({ where: { id: datos.clientes.beto.id }, data: { estado: 'inactivo' } });
      const r = await con(request(app).post('/api/reservas'), beto.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect([401, 403]).toContain(r.status);
    });

    test('sin sesión no se reserva', async () => {
      expect((await request(app).post('/api/reservas').send(reservaBase())).status).toBe(401);
    });
  });

  describe('cupos: una franja no se vende dos veces', () => {
    test('el sitio tiene capacidad 1: el segundo recibe 409', async () => {
      const primero = await crear(ana.token, reservaBase());
      expect(primero.status).toBe(201);

      const beto = await entrar('beto@prueba.local');
      const segundo = await con(request(app).post('/api/reservas'), beto.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect(segundo.status).toBe(409);
    });

    test('dos pedidos simultáneos por el último cupo: entra exactamente uno', async () => {
      // Es la razón de ser de la transacción serializable. Si alguien la saca,
      // acá aparecen dos 201 y dos clientes a la misma hora.
      const beto = await entrar('beto@prueba.local');
      const [a, b] = await Promise.all([
        crear(ana.token, reservaBase()),
        con(request(app).post('/api/reservas'), beto.token).send({
          id_vehiculo: datos.vehiculos.autoDeBeto.id,
          id_tipo_servicio: datos.servicios.expreso.id,
          id_estacionamiento: datos.sitio.id,
          fecha: manana,
          hora_inicio: '09:00'
        })
      ]);

      const creadas = [a, b].filter((r) => r.status === 201);
      const rechazadas = [a, b].filter((r) => r.status === 409);
      expect(creadas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);
      expect(await bd.prisma.reserva.count()).toBe(1);
    });

    test('una franja que apenas se toca con otra sí cuenta como ocupada', async () => {
      await crear(ana.token, reservaBase({ hora_inicio: '09:00' })); // 09:00-10:00
      const beto = await entrar('beto@prueba.local');
      const solapada = await con(request(app).post('/api/reservas'), beto.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:30' // se cruza media hora
      });
      expect(solapada.status).toBe(409);
    });

    test('franjas pegadas conviven: 09:00-10:00 y 10:00-11:00', async () => {
      await crear(ana.token, reservaBase({ hora_inicio: '09:00' }));
      const segunda = await crear(ana.token, reservaBase({ hora_inicio: '10:00' }));
      expect(segunda.status).toBe(201);
    });

    test('la capacidad es por sitio: el mismo horario en otro edificio entra', async () => {
      await crear(ana.token, reservaBase());
      const otro = await crear(ana.token, reservaBase({ id_estacionamiento: datos.sitioAmplio.id }));
      expect(otro.status).toBe(201);
    });

    test('un sitio con capacidad 2 admite dos a la misma hora y rechaza la tercera', async () => {
      const beto = await entrar('beto@prueba.local');
      const enTorre = (token, idVehiculo) => con(request(app).post('/api/reservas'), token).send({
        id_vehiculo: idVehiculo,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitioAmplio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect((await enTorre(ana.token, datos.vehiculos.autoDeAna.id)).status).toBe(201);
      expect((await enTorre(beto.token, datos.vehiculos.autoDeBeto.id)).status).toBe(201);

      // Un tercer vehículo, ya sin cupo
      const tercero = await bd.prisma.vehiculo.create({
        data: { id_cliente: datos.clientes.ana.id, placa: 'TER-0003', id_tipo_vehiculo: datos.tipos.liviano.id }
      });
      expect((await enTorre(ana.token, tercero.id)).status).toBe(409);
    });

    test('un bloqueo manual de la agenda deja la franja sin cupo', async () => {
      const bloqueo = await con(request(app).post('/api/agenda/bloqueos'), operador.token)
        .send({ fecha: manana, hora_inicio: '09:00', hora_fin: '10:00', nota: 'Mantenimiento' });
      expect(bloqueo.status).toBe(201);

      const r = await crear(ana.token, reservaBase());
      expect(r.status).toBe(409);
    });

    test('una reserva cancelada devuelve el cupo', async () => {
      const primera = await crear(ana.token, reservaBase());
      await con(request(app).put(`/api/reservas/${primera.body.data.id}/cancelar`), ana.token).send({ motivo: 'cambio de planes' });

      const beto = await entrar('beto@prueba.local');
      const segunda = await con(request(app).post('/api/reservas'), beto.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect(segunda.status).toBe(201);
    });

    test('la modalidad profunda cuenta las bahías del taller', async () => {
      // El taller tiene una sola bahía: la segunda profunda a la misma hora no entra.
      const profunda = (token, idVehiculo, idSitio) => con(request(app).post('/api/reservas'), token).send({
        id_vehiculo: idVehiculo,
        id_tipo_servicio: datos.servicios.profunda.id,
        id_estacionamiento: idSitio,
        fecha: manana,
        hora_inicio: '09:00'
      });
      const beto = await entrar('beto@prueba.local');
      expect((await profunda(ana.token, datos.vehiculos.autoDeAna.id, datos.taller.id)).status).toBe(201);
      expect((await profunda(beto.token, datos.vehiculos.autoDeBeto.id, datos.taller.id)).status).toBe(409);
      // Y no se puede esquivar pidiéndola en un edificio: la profunda es en taller
      expect((await profunda(beto.token, datos.vehiculos.autoDeBeto.id, datos.sitioAmplio.id)).status).toBe(400);
    });

    test('expreso y profunda no se quitan cupo entre sí', async () => {
      const beto = await entrar('beto@prueba.local');
      expect((await crear(ana.token, reservaBase())).status).toBe(201);
      const profunda = await con(request(app).post('/api/reservas'), beto.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.profunda.id,
        id_estacionamiento: datos.taller.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect(profunda.status).toBe(201);
    });
  });

  describe('plan del edificio', () => {
    test('cubre el servicio principal pero no los adicionales', async () => {
      const plan = await bd.prisma.plan.create({
        data: { nombre: 'Plan Edificio', precio_mensual: 100, lavados_incluidos: 5, modalidad: 'expreso' }
      });
      await bd.prisma.suscripcion.create({
        data: { id_estacionamiento: datos.sitio.id, id_plan: plan.id, estado: 'activa' }
      });

      const r = await crear(ana.token, reservaBase({ adicionales: [datos.adicionales.encerado.id] }));
      expect(r.status).toBe(201);
      // 0 del lavado (lo cubre el plan) + 5 del encerado
      expect(r.body.data.precio_final).toBe(5);
      expect(r.body.data.id_suscripcion).not.toBeNull();
    });

    test('agotado el cupo del mes, se vuelve a cobrar', async () => {
      const plan = await bd.prisma.plan.create({
        data: { nombre: 'Plan chico', precio_mensual: 20, lavados_incluidos: 1, modalidad: 'expreso' }
      });
      await bd.prisma.suscripcion.create({
        data: { id_estacionamiento: datos.sitio.id, id_plan: plan.id, estado: 'activa' }
      });

      const incluida = await crear(ana.token, reservaBase({ hora_inicio: '09:00' }));
      expect(incluida.body.data.precio_final).toBe(0);

      const cobrada = await crear(ana.token, reservaBase({ hora_inicio: '11:00' }));
      expect(cobrada.body.data.precio_final).toBe(10);
      expect(cobrada.body.data.id_suscripcion).toBeNull();
    });
  });

  describe('flujo de estados', () => {
    let reserva;
    beforeEach(async () => {
      reserva = (await crear(ana.token, reservaBase())).body.data;
    });

    const accion = (nombre, token = operador.token, cuerpo = {}) =>
      con(request(app).put(`/api/reservas/${reserva.id}/${nombre}`), token).send(cuerpo);
    // El lavado se paga antes de hacerlo (cobro.service.js)
    const pagar = () => con(request(app).post(`/api/reservas/${reserva.id}/pagos`), operador.token)
      .send({ monto: reserva.precio_final, metodo: 'efectivo' });

    test('solicitada → confirmada → en_proceso → completada', async () => {
      expect((await accion('confirmar')).body.data.estado).toBe('confirmada');
      await pagar();
      expect((await accion('iniciar')).body.data.estado).toBe('en_proceso');
      expect((await accion('completar')).body.data.estado).toBe('completada');
    });

    test('no se empieza a lavar sin pagar; con el pago aprobado, sí', async () => {
      await accion('confirmar');
      const sinPagar = await accion('iniciar');
      expect(sinPagar.status).toBe(400);
      expect(sinPagar.body.message).toMatch(/falta el pago de \$10\.00/);
      // Un comprobante en verificación todavía no cuenta
      await bd.prisma.pago.create({ data: { id_reserva: reserva.id, monto: 10, metodo: 'transferencia', estado: 'en_verificacion' } });
      expect((await accion('iniciar')).status).toBe(400);
      await pagar();
      expect((await accion('iniciar')).status).toBe(200);
    });

    test('el pago anticipado se puede apagar con su parámetro', async () => {
      await bd.prisma.parametro.create({ data: { clave: 'reservas.pago_anticipado', valor: '0' } });
      await accion('confirmar');
      expect((await accion('iniciar')).status).toBe(200);
    });

    test('no se puede saltar un paso', async () => {
      const r = await accion('completar'); // está en "solicitada"
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/no se puede/i);
    });

    test('no se confirma dos veces', async () => {
      await accion('confirmar');
      expect((await accion('confirmar')).status).toBe(400);
    });

    test('cada cambio deja rastro en el historial', async () => {
      await accion('confirmar');
      const historial = await bd.prisma.historialReserva.findMany({ where: { id_reserva: reserva.id } });
      expect(historial.map((h) => h.accion)).toEqual(expect.arrayContaining(['creacion', 'confirmar']));
    });

    test('el cliente cancela la suya', async () => {
      const r = await accion('cancelar', ana.token, { motivo: 'no puedo ir' });
      expect(r.status).toBe(200);
      expect(r.body.data.estado).toBe('cancelada');
    });

    test('el cliente no puede cancelar la de otro', async () => {
      const beto = await entrar('beto@prueba.local');
      expect((await accion('cancelar', beto.token, { motivo: 'curiosidad' })).status).toBe(403);
    });

    test('el cliente no puede confirmar ni dar por completada su reserva', async () => {
      expect((await accion('confirmar', ana.token)).status).toBe(403);
      expect((await accion('completar', ana.token)).status).toBe(403);
    });

    test('un lavador sin la reserva asignada no puede tocarla', async () => {
      const luis = await entrar('luis');
      await accion('confirmar');
      expect((await accion('iniciar', luis.token)).status).toBe(403);
    });

    test('asignado el lavador, sí puede iniciarla y completarla', async () => {
      const luis = await entrar('luis');
      await con(request(app).put(`/api/reservas/${reserva.id}/asignar-lavador`), operador.token)
        .send({ id_lavador: datos.lavador.id });
      await accion('confirmar');
      await pagar();

      expect((await accion('iniciar', luis.token)).status).toBe(200);
      expect((await accion('completar', luis.token)).status).toBe(200);
    });
  });

  describe('acceso a las reservas', () => {
    test('el cliente solo ve las suyas en /api/mis-reservas', async () => {
      await crear(ana.token, reservaBase());
      const beto = await entrar('beto@prueba.local');

      const deAna = await con(request(app).get('/api/mis-reservas'), ana.token);
      const deBeto = await con(request(app).get('/api/mis-reservas'), beto.token);
      expect(deAna.body.data).toHaveLength(1);
      expect(deBeto.body.data).toHaveLength(0);
    });

    test('un cliente no puede abrir la reserva de otro por id', async () => {
      const reserva = (await crear(ana.token, reservaBase())).body.data;
      const beto = await entrar('beto@prueba.local');
      expect((await con(request(app).get(`/api/reservas/${reserva.id}`), beto.token)).status).toBe(403);
    });

    test('el cliente no accede al listado interno', async () => {
      expect((await con(request(app).get('/api/reservas'), ana.token)).status).toBe(403);
    });

    test('el operador ve todas y puede filtrar por fecha', async () => {
      await crear(ana.token, reservaBase());
      const todas = await con(request(app).get('/api/reservas'), operador.token);
      expect(todas.body.data).toHaveLength(1);

      const otroDia = await con(request(app).get(`/api/reservas?fecha=${enDias(5)}`), operador.token);
      expect(otroDia.body.data).toHaveLength(0);
    });
  });

  describe('cotizar (vista previa del precio)', () => {
    test('devuelve el mismo total que después se cobra', async () => {
      const c = await con(request(app).post('/api/reservas/cotizar'), ana.token).send({
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        adicionales: [datos.adicionales.encerado.id]
      });
      expect(c.status).toBe(200);
      expect(c.body.data.total).toBe(15);
      expect(c.body.data.duracion_min).toBe(90);

      const r = await crear(ana.token, reservaBase({ adicionales: [datos.adicionales.encerado.id] }));
      expect(r.body.data.precio_final).toBe(c.body.data.total);
    });

    test('un cliente no cotiza con el vehículo de otro', async () => {
      const c = await con(request(app).post('/api/reservas/cotizar'), ana.token).send({
        id_vehiculo: datos.vehiculos.autoDeBeto.id,
        id_tipo_servicio: datos.servicios.expreso.id
      });
      expect(c.status).toBe(403);
    });
  });

  describe('walk-in: el operador reserva a nombre del cliente', () => {
    test('puede indicar de qué cliente es la reserva', async () => {
      const r = await con(request(app).post('/api/reservas'), operador.token).send({
        id_cliente: datos.clientes.ana.id,
        ...reservaBase()
      });
      expect(r.status).toBe(201);
      expect(r.body.data.id_cliente).toBe(datos.clientes.ana.id);
    });

    test('sin cliente indicado no se crea nada', async () => {
      const r = await con(request(app).post('/api/reservas'), operador.token).send(reservaBase());
      expect(r.status).toBe(400);
    });
  });
});
