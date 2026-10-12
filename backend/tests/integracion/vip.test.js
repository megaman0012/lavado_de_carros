/**
 * Planes VIP (fase 4 de la expansión): plan personal con cobro mensual.
 *
 * Lo que tiene que quedar garantizado:
 *   - sin el mes pagado no hay beneficios; con el pago aprobado sí;
 *   - los lavados incluidos salen a $0 y, agotados, rige el descuento (también
 *     en los adicionales);
 *   - el VIP reserva con más anticipación y usa los cupos apartados;
 *   - el cliente solo toca sus cobros; el panel genera, registra y verifica;
 *   - cancelar respeta lo ya pagado del mes.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con, enDias } = require('../ayudas/api');
const fechas = require('../../src/utils/fechas');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de VIP.\n');
}

// Un PNG mínimo válido, para subir como comprobante
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

d('Planes VIP', () => {
  let datos;
  let admin;
  let operador;
  let ana;
  let plan;
  const periodo = () => fechas.aISO(fechas.hoy()).slice(0, 7);

  beforeEach(async () => {
    datos = await bd.sembrar();
    plan = await bd.prisma.plan.create({
      data: {
        nombre: 'VIP Oro', tipo: 'personal', precio_mensual: 30, lavados_incluidos: 2,
        modalidad: 'expreso', descuento_pct: 20, dias_anticipacion: 30
      }
    });
    [admin, operador, ana] = await Promise.all([entrar('admin'), entrar('operador'), entrar('ana@prueba.local')]);
  });
  afterAll(() => bd.desconectar());

  const get = (url, token) => con(request(app).get(url), token);
  const post = (url, token, body) => con(request(app).post(url), token).send(body);
  const put = (url, token, body) => con(request(app).put(url), token).send(body);

  const reservar = (token = ana.token, extra = {}) => post('/api/reservas', token, {
    id_vehiculo: datos.vehiculos.autoDeAna.id, id_tipo_servicio: datos.servicios.expreso.id,
    id_estacionamiento: datos.sitioAmplio.id, fecha: enDias(1), hora_inicio: '09:00', ...extra
  });

  // Ana se suscribe, sube el comprobante y el operador lo aprueba
  const hacerVip = async () => {
    const s = await post('/api/mi-plan', ana.token, { id_plan: plan.id });
    expect(s.status).toBe(201);
    const cobro = s.body.data.pagos[0];
    const sube = await con(request(app).post(`/api/mi-plan/pagos/${cobro.id}/comprobante`), ana.token)
      .attach('comprobante', PNG, 'comprobante.png');
    expect(sube.status).toBe(200);
    const ok = await put(`/api/planes/pagos/${cobro.id}/verificar`, operador.token, { aprobar: true });
    expect(ok.status).toBe(200);
    // Corriendo el último día del mes, "mañana" ya es el mes siguiente: también se paga
    const mesManana = enDias(1).slice(0, 7);
    if (mesManana !== periodo()) {
      await post(`/api/planes/suscripciones/${s.body.data.id}/pagos`, operador.token, { periodo: mesManana });
    }
    return cobro;
  };

  describe('beneficios', () => {
    test('sin el mes pagado no hay beneficios', async () => {
      await post('/api/mi-plan', ana.token, { id_plan: plan.id });
      const r = await reservar();
      expect(r.body.data).toMatchObject({ precio_final: 10, vip: false });
    });

    test('lavados incluidos a $0, después descuento, también en adicionales', async () => {
      await hacerVip();
      const horas = ['09:00', '10:00', '11:00'];
      const precios = [];
      for (const h of horas) {
        const r = await reservar(ana.token, { hora_inicio: h, adicionales: [datos.adicionales.encerado.id] });
        expect(r.status).toBe(201);
        precios.push(r.body.data.precio_final);
      }
      // 1° y 2°: servicio incluido + encerado $5 con 20 % = $4. 3°: $10 → $8, + $4
      expect(precios).toEqual([4, 4, 12]);

      const plan_ = (await get('/api/mi-plan', ana.token)).body.data;
      expect(plan_.restantes).toBe(0);
      expect(plan_.suscripcion.vigente).toBe(true);
    });

    test('cancelar una reserva incluida devuelve el lavado del mes', async () => {
      await hacerVip();
      const r = await reservar();
      await put(`/api/reservas/${r.body.data.id}/cancelar`, ana.token, {});
      expect((await get('/api/mi-plan', ana.token)).body.data.restantes).toBe(2);
    });

    test('un mes sin pagar no tiene beneficios aunque el actual sí', async () => {
      await hacerVip();
      const siguiente = new Date(Date.UTC(fechas.hoy().getUTCFullYear(), fechas.hoy().getUTCMonth() + 1, 5));
      const r = await post('/api/reservas', operador.token, {
        id_cliente: datos.clientes.ana.id, id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id, id_estacionamiento: datos.sitioAmplio.id,
        fecha: fechas.aISO(siguiente), hora_inicio: '09:00'
      });
      expect(r.status).toBe(201);
      expect(r.body.data.precio_final).toBe(10);
      expect(r.body.data.vip).toBe(true); // la prioridad sí: hoy es VIP
    });

    test('cancelar el plan respeta lo ya pagado del mes', async () => {
      await hacerVip();
      expect((await put('/api/mi-plan/cancelar', ana.token, {})).status).toBe(200);
      expect((await reservar()).body.data.precio_final).toBe(0);
    });

    test('las empresas no tienen plan VIP', async () => {
      const empresa = await bd.prisma.cliente.create({ data: { tipo: 'empresa', nombre: 'X SA', ruc: '0990000000001' } });
      const r = await post('/api/planes/suscripciones', admin.token, { id_plan: plan.id, id_cliente: empresa.id });
      expect(r.status).toBe(400);
    });
  });

  describe('prioridad', () => {
    test('un cliente reserva hasta 14 días adelante; un VIP, hasta los de su plan', async () => {
      const lejos = { fecha: enDias(20) };
      expect((await reservar(ana.token, lejos)).status).toBe(400);
      await hacerVip();
      expect((await reservar(ana.token, lejos)).status).toBe(201);
    });

    test('los cupos apartados son para el VIP hasta que se liberan', async () => {
      await bd.prisma.parametro.create({ data: { clave: 'vip.cupos_reservados', valor: '1' } });
      const dia = enDias(3); // más de 24 h: los cupos apartados siguen protegidos
      const beto = await entrar('beto@prueba.local');
      const deBeto = (token) => post('/api/reservas', token, {
        id_vehiculo: datos.vehiculos.autoDeBeto.id, id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitioAmplio.id, fecha: dia, hora_inicio: '09:00'
      });
      // Torre Norte tiene 2 cupos: uno libre para todos y uno apartado
      expect((await deBeto(beto.token)).status).toBe(201);
      const anonimo = await request(app).get('/api/agenda/disponibilidad')
        .query({ fecha: dia, modalidad: 'expreso', id_estacionamiento: datos.sitioAmplio.id });
      expect(anonimo.body.data.franjas.find((f) => f.hora_inicio === '09:00').cupos).toBe(0);

      await hacerVip();
      const comoVip = await con(request(app).get('/api/agenda/disponibilidad'), ana.token)
        .query({ fecha: dia, modalidad: 'expreso', id_estacionamiento: datos.sitioAmplio.id });
      expect(comoVip.body.data.franjas.find((f) => f.hora_inicio === '09:00').cupos).toBe(1);
      expect((await reservar(ana.token, { fecha: dia })).status).toBe(201);
    });

    test('nunca se aparta el último cupo de un sitio', async () => {
      await bd.prisma.parametro.create({ data: { clave: 'vip.cupos_reservados', valor: '5' } });
      // Edificio Central tiene capacidad 1: sigue abierto para todos
      const r = await request(app).get('/api/agenda/disponibilidad')
        .query({ fecha: enDias(3), modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(r.body.data.franjas.find((f) => f.hora_inicio === '09:00').cupos).toBe(1);
    });
  });

  describe('cobros', () => {
    test('el panel genera los cobros del mes sin duplicar', async () => {
      await post('/api/planes/suscripciones', admin.token, { id_plan: plan.id, id_cliente: datos.clientes.ana.id });
      const siguiente = fechas.aISO(new Date(Date.UTC(fechas.hoy().getUTCFullYear(), fechas.hoy().getUTCMonth() + 1, 1))).slice(0, 7);
      expect((await post('/api/planes/cobros', admin.token, { periodo: siguiente })).body.data.generados).toBe(1);
      expect((await post('/api/planes/cobros', admin.token, { periodo: siguiente })).body.data.generados).toBe(0);
    });

    test('el panel registra un pago en efectivo y el mes queda vigente', async () => {
      const s = await post('/api/planes/suscripciones', admin.token, { id_plan: plan.id, id_cliente: datos.clientes.ana.id });
      const r = await post(`/api/planes/suscripciones/${s.body.data.id}/pagos`, operador.token, { metodo: 'efectivo' });
      expect(r.status).toBe(201);
      expect((await post(`/api/planes/suscripciones/${s.body.data.id}/pagos`, operador.token, {})).status).toBe(409);
      expect((await reservar()).body.data.precio_final).toBe(0);
    });

    test('rechazar pide motivo; el cliente puede volver a subir', async () => {
      const s = await post('/api/mi-plan', ana.token, { id_plan: plan.id });
      const cobro = s.body.data.pagos[0];
      await con(request(app).post(`/api/mi-plan/pagos/${cobro.id}/comprobante`), ana.token).attach('comprobante', PNG, 'c.png');
      expect((await put(`/api/planes/pagos/${cobro.id}/verificar`, operador.token, { aprobar: false })).status).toBe(400);
      expect((await put(`/api/planes/pagos/${cobro.id}/verificar`, operador.token, { aprobar: false, motivo: 'Monto incompleto' })).status).toBe(200);
      const otra = await con(request(app).post(`/api/mi-plan/pagos/${cobro.id}/comprobante`), ana.token).attach('comprobante', PNG, 'c2.png');
      expect(otra.status).toBe(200);
    });

    test('nadie toca el cobro de otro', async () => {
      const s = await post('/api/mi-plan', ana.token, { id_plan: plan.id });
      const beto = await entrar('beto@prueba.local');
      const r = await con(request(app).post(`/api/mi-plan/pagos/${s.body.data.pagos[0].id}/comprobante`), beto.token)
        .attach('comprobante', PNG, 'c.png');
      expect(r.status).toBe(404);
    });

    test('un plan VIP activo a la vez, y lo cobrado suma en reportes', async () => {
      await hacerVip();
      expect((await post('/api/mi-plan', ana.token, { id_plan: plan.id })).status).toBe(409);
      const hoy = fechas.aISO(fechas.hoy());
      const resumen = (await get(`/api/reportes/resumen?desde=${hoy}&hasta=${hoy}`, admin.token)).body.data;
      expect(resumen).toMatchObject({ cobrado_planes: 30, pagos_planes: 1 });
      expect(periodo()).toMatch(/^\d{4}-\d{2}$/);
    });

    test('los parámetros de prioridad se validan', async () => {
      expect((await put('/api/parametros/vip.cupos_reservados', admin.token, { valor: -1 })).status).toBe(400);
      expect((await put('/api/parametros/reservas.dias_anticipacion', admin.token, { valor: 21 })).status).toBe(200);
    });
  });
});
