/**
 * Clientes empresa (fase 2 de la expansión): flota, tarifas pactadas,
 * parqueadero privado y cobro a crédito con corte mensual.
 *
 * Lo que tiene que quedar garantizado:
 *   - la empresa paga su tarifa pactada y una persona, la de lista;
 *   - sus lavados son a crédito y no se pueden cobrar sueltos;
 *   - un parqueadero privado es solo de su empresa y no se ofrece al público;
 *   - un lavado entra en UN solo corte, y nunca se pierde (anular lo libera);
 *   - pagar el corte cuadra los reportes de "cobrado" como un pago normal;
 *   - el gestor ve su flota y sus cortes, y nada de otra empresa.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con, enDias } = require('../ayudas/api');
const fechas = require('../../src/utils/fechas');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de empresas.\n');
}

d('Empresas', () => {
  let datos;
  let admin;
  let opQuito;
  let gestor;
  let empresa;
  let camion;
  let manana;
  // El período de los cortes: el mes en curso (ya empezó, así que se puede cerrar)
  const periodo = fechas.aISO(fechas.inicioMes(fechas.hoy())).slice(0, 7);

  beforeEach(async () => {
    datos = await bd.sembrar();
    manana = enDias(1);
    empresa = await bd.prisma.cliente.create({
      data: {
        tipo: 'empresa', nombre: 'Transportes Andinos', ruc: '0990000000001',
        razon_social: 'Transportes Andinos S.A.', email: 'flota@andinos.local'
      }
    });
    camion = await bd.prisma.vehiculo.create({
      data: { id_cliente: empresa.id, placa: 'GAA-0001', marca: 'Hino', id_tipo_vehiculo: datos.tipos.liviano.id }
    });
    await bd.prisma.usuario.create({
      data: { username: 'flota@andinos.local', password: await require('bcryptjs').hash(bd.CLAVE, 4), rol: 'cliente', id_cliente: empresa.id }
    });
    // Tarifa pactada: el expreso a $7 en vez de los $10 de lista
    await bd.prisma.tarifaEmpresa.create({
      data: { id_cliente: empresa.id, id_tipo_servicio: datos.servicios.expreso.id, id_tipo_vehiculo: datos.tipos.liviano.id, precio: 7 }
    });
    [admin, opQuito, gestor] = await Promise.all([entrar('admin'), entrar('opquito'), entrar('flota@andinos.local')]);
  });
  afterAll(() => bd.desconectar());

  const get = (url, token) => con(request(app).get(url), token);
  const post = (url, token, body) => con(request(app).post(url), token).send(body);
  const put = (url, token, body) => con(request(app).put(url), token).send(body);

  const reservarFlota = (hora = '09:00', idSitio = datos.sitioAmplio.id, extra = {}) =>
    post('/api/reservas', gestor.token, {
      id_vehiculo: camion.id, id_tipo_servicio: datos.servicios.expreso.id,
      id_estacionamiento: idSitio, fecha: manana, hora_inicio: hora, ...extra
    });

  // Lleva una reserva a completada y a una fecha del período (ya empezado)
  const completarEnPeriodo = (id, dia = fechas.inicioMes(fechas.hoy())) =>
    bd.prisma.reserva.update({ where: { id }, data: { estado: 'completada', fecha: dia } });

  describe('precio y forma de cobro', () => {
    test('la empresa paga su tarifa pactada y su lavado nace a crédito', async () => {
      const r = await reservarFlota();
      expect(r.status).toBe(201);
      expect(r.body.data.precio_final).toBe(7);
      expect(r.body.data.forma_cobro).toBe('credito');

      const cot = await post('/api/reservas/cotizar', gestor.token, {
        id_vehiculo: camion.id, id_tipo_servicio: datos.servicios.expreso.id
      });
      expect(cot.body.data).toMatchObject({ precio_servicio: 7, precio_lista: 10, tarifa_empresa: true });
    });

    test('sin tarifa pactada para ese servicio, paga el precio de lista', async () => {
      const r = await post('/api/reservas', gestor.token, {
        id_vehiculo: camion.id, id_tipo_servicio: datos.servicios.profunda.id,
        id_estacionamiento: datos.taller.id, fecha: manana, hora_inicio: '09:00'
      });
      expect(r.status).toBe(201);
      expect(r.body.data.precio_final).toBe(25);
    });

    test('una persona sigue al contado y a precio de lista', async () => {
      const ana = await entrar('ana@prueba.local');
      const r = await post('/api/reservas', ana.token, {
        id_vehiculo: datos.vehiculos.autoDeAna.id, id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id, fecha: manana, hora_inicio: '09:00'
      });
      expect(r.body.data.precio_final).toBe(10);
      expect(r.body.data.forma_cobro).toBe('contado');
    });

    test('a la empresa no se le exige pagar antes: se lava y se cobra en el corte', async () => {
      const id = (await reservarFlota()).body.data.id;
      const operador = await entrar('operador');
      expect((await put(`/api/reservas/${id}/confirmar`, operador.token, {})).status).toBe(200);
      expect((await put(`/api/reservas/${id}/iniciar`, operador.token, {})).status).toBe(200);
    });

    test('un lavado a crédito no se cobra suelto', async () => {
      const id = (await reservarFlota()).body.data.id;
      const operador = await entrar('operador');
      const manual = await post(`/api/reservas/${id}/pagos`, operador.token, { monto: 7, metodo: 'efectivo' });
      expect(manual.status).toBe(400);
      expect(manual.body.message).toMatch(/corte mensual/);
      const tarjeta = await post(`/api/reservas/${id}/pagos/tarjeta`, gestor.token, {});
      expect(tarjeta.status).toBe(400);
    });
  });

  describe('parqueadero privado', () => {
    let privado;
    beforeEach(async () => {
      const r = await post('/api/estacionamientos', admin.token, {
        nombre: 'Patio Andinos', tipo: 'privado', id_cliente: empresa.id,
        id_ciudad: datos.ciudades.guayaquil.id, capacidad_expreso: 3
      });
      expect(r.status).toBe(201);
      privado = r.body.data;
    });

    test('solo su empresa reserva ahí', async () => {
      expect((await reservarFlota('09:00', privado.id)).status).toBe(201);
      const ana = await entrar('ana@prueba.local');
      const ajena = await post('/api/reservas', ana.token, {
        id_vehiculo: datos.vehiculos.autoDeAna.id, id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: privado.id, fecha: manana, hora_inicio: '09:00'
      });
      expect(ajena.status).toBe(400);
    });

    test('no aparece al público, pero sí en "mis sitios" de la empresa', async () => {
      const publicos = await request(app).get('/api/public/estacionamientos');
      expect(publicos.body.data.some((e) => e.id === privado.id)).toBe(false);
      const mios = await get('/api/mi-empresa/sitios', gestor.token);
      expect(mios.body.data.map((e) => e.nombre)).toEqual(['Patio Andinos']);
    });

    test('un sitio privado exige una empresa como dueña', async () => {
      const sinDueno = await post('/api/estacionamientos', admin.token, {
        nombre: 'Huérfano', tipo: 'privado', id_ciudad: datos.ciudades.guayaquil.id
      });
      expect(sinDueno.status).toBe(400);
      const deUnaPersona = await post('/api/estacionamientos', admin.token, {
        nombre: 'De Ana', tipo: 'privado', id_cliente: datos.clientes.ana.id, id_ciudad: datos.ciudades.guayaquil.id
      });
      expect(deUnaPersona.status).toBe(400);
    });
  });

  describe('corte mensual', () => {
    test('vista previa: solo lo completado y no cortado', async () => {
      const a = (await reservarFlota('09:00')).body.data.id;
      await reservarFlota('10:00'); // queda solicitada: no entra
      await completarEnPeriodo(a);
      const r = await get(`/api/empresas/${empresa.id}/corte-previo?periodo=${periodo}`, admin.token);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ cantidad: 1, total: 7 });
      expect(r.body.data.filas[0].placa).toBe('GAA-0001');
    });

    test('ciclo completo: cerrar → facturar → pagar, y el cobrado cuadra', async () => {
      const ids = [(await reservarFlota('09:00')).body.data.id, (await reservarFlota('10:00')).body.data.id];
      for (const id of ids) await completarEnPeriodo(id);

      const cierre = await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo });
      expect(cierre.status).toBe(201);
      const corte = cierre.body.data;
      expect(corte).toMatchObject({ cantidad: 2, total: 14, estado: 'cerrado' });

      // Un lavado no entra dos veces
      const otra = await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo });
      expect(otra.status).toBe(409);

      expect((await put(`/api/cortes/${corte.id}/pagar`, admin.token, {})).status).toBe(400); // falta facturar
      expect((await put(`/api/cortes/${corte.id}/facturar`, admin.token, {})).status).toBe(400); // falta el número
      const fact = await put(`/api/cortes/${corte.id}/facturar`, admin.token, { numero_factura: '001-001-000000123' });
      expect(fact.body.data.estado).toBe('facturado');

      const pago = await put(`/api/cortes/${corte.id}/pagar`, admin.token, { referencia: 'TRF 555' });
      expect(pago.body.data.estado).toBe('pagado');
      const pagos = await bd.prisma.pago.findMany({ where: { id_reserva: { in: ids } } });
      expect(pagos.map((p) => p.monto).sort()).toEqual([7, 7]);
      expect(pagos.every((p) => p.estado === 'aprobado' && p.referencia.includes(corte.codigo))).toBe(true);

      const hoy = fechas.aISO(fechas.hoy());
      const resumen = await get(`/api/reportes/resumen?desde=${hoy}&hasta=${hoy}`, admin.token);
      expect(resumen.body.data.cobrado).toBe(14);

      // Pagado ya no se anula
      expect((await put(`/api/cortes/${corte.id}/anular`, admin.token, { motivo: 'error' })).status).toBe(400);
    });

    test('anular un corte libera sus lavados para el siguiente', async () => {
      const id = (await reservarFlota()).body.data.id;
      await completarEnPeriodo(id);
      const corte = (await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo })).body.data;

      expect((await put(`/api/cortes/${corte.id}/anular`, admin.token, {})).status).toBe(400); // pide motivo
      expect((await put(`/api/cortes/${corte.id}/anular`, admin.token, { motivo: 'precio mal pactado' })).status).toBe(200);
      expect((await bd.prisma.reserva.findUnique({ where: { id } })).id_corte).toBeNull();

      const nuevo = await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo });
      expect(nuevo.status).toBe(201);
      expect(nuevo.body.data.codigo).toMatch(/-2$/); // se distingue del anulado
    });

    test('lo completado de un mes anterior entra en el corte siguiente', async () => {
      const id = (await reservarFlota()).body.data.id;
      const mesPasado = fechas.sumarDias(fechas.inicioMes(fechas.hoy()), -5);
      await completarEnPeriodo(id, mesPasado);
      const previo = await get(`/api/empresas/${empresa.id}/corte-previo?periodo=${periodo}`, admin.token);
      expect(previo.body.data).toMatchObject({ cantidad: 1, de_periodos_anteriores: 1 });
    });

    test('sin lavados no hay corte, y un período futuro no se cierra', async () => {
      expect((await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo })).status).toBe(400);
      expect((await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo: '2999-01' })).status).toBe(400);
      expect((await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo: 'octubre' })).status).toBe(400);
    });

    test('la facturación es nacional: el operador de ciudad no entra', async () => {
      expect((await get('/api/empresas', opQuito.token)).status).toBe(403);
    });
  });

  describe('tarifas', () => {
    test('la tabla muestra lista y pactada; vaciar una la quita', async () => {
      const tabla = (await get(`/api/empresas/${empresa.id}/tarifas`, admin.token)).body.data;
      const expreso = tabla.find((t) => t.id_tipo_servicio === datos.servicios.expreso.id && t.id_tipo_vehiculo === datos.tipos.liviano.id);
      expect(expreso).toMatchObject({ precio_lista: 10, precio_empresa: 7 });

      const r = await put(`/api/empresas/${empresa.id}/tarifas`, admin.token, {
        tarifas: [
          { id_tipo_servicio: datos.servicios.expreso.id, id_tipo_vehiculo: datos.tipos.liviano.id, precio: null },
          { id_tipo_servicio: datos.servicios.profunda.id, id_tipo_vehiculo: datos.tipos.liviano.id, precio: 20 }
        ]
      });
      expect(r.status).toBe(200);
      const nueva = r.body.data;
      expect(nueva.find((t) => t.id_tipo_servicio === datos.servicios.expreso.id && t.id_tipo_vehiculo === datos.tipos.liviano.id).precio_empresa).toBeNull();
      expect(nueva.find((t) => t.id_tipo_servicio === datos.servicios.profunda.id && t.id_tipo_vehiculo === datos.tipos.liviano.id).precio_empresa).toBe(20);

      const mala = await put(`/api/empresas/${empresa.id}/tarifas`, admin.token, {
        tarifas: [{ id_tipo_servicio: datos.servicios.expreso.id, id_tipo_vehiculo: datos.tipos.liviano.id, precio: -1 }]
      });
      expect(mala.status).toBe(400);
    });
  });

  describe('gestor de flota', () => {
    test('ve el gasto por vehículo y lo pendiente de corte', async () => {
      const id = (await reservarFlota()).body.data.id;
      await completarEnPeriodo(id, fechas.hoy());
      const r = await get('/api/mi-empresa/resumen', gestor.token);
      expect(r.body.data.por_vehiculo[0]).toMatchObject({ placa: 'GAA-0001', completados: 1, gasto: 7 });
      expect(r.body.data.pendiente_de_corte).toEqual({ cantidad: 1, total: 7 });
    });

    test('descarga sus cortes y no los de otra empresa', async () => {
      const id = (await reservarFlota()).body.data.id;
      await completarEnPeriodo(id);
      const corte = (await post(`/api/empresas/${empresa.id}/cortes`, admin.token, { periodo })).body.data;
      expect((await get('/api/mi-empresa/cortes', gestor.token)).body.data).toHaveLength(1);
      expect((await get(`/api/mi-empresa/cortes/${corte.id}/excel`, gestor.token)).status).toBe(200);

      const otra = await bd.prisma.cliente.create({ data: { tipo: 'empresa', nombre: 'Otra', ruc: '0990000000002', email: 'otra@x.local' } });
      await bd.prisma.usuario.create({
        data: { username: 'otra@x.local', password: await require('bcryptjs').hash(bd.CLAVE, 4), rol: 'cliente', id_cliente: otra.id }
      });
      const intruso = await entrar('otra@x.local');
      expect((await get(`/api/mi-empresa/cortes/${corte.id}/excel`, intruso.token)).status).toBe(404);
    });

    test('una persona no tiene portal de empresa', async () => {
      const ana = await entrar('ana@prueba.local');
      expect((await get('/api/mi-empresa/resumen', ana.token)).status).toBe(403);
    });

    test('el login dice que la cuenta es de empresa', () => {
      expect(gestor.usuario.cliente).toMatchObject({ tipo: 'empresa' });
    });
  });

  describe('alta de empresas', () => {
    test('una empresa exige RUC de 13 dígitos y no se repite', async () => {
      const sinRuc = await post('/api/clientes', admin.token, { nombre: 'Sin RUC', tipo: 'empresa' });
      expect(sinRuc.status).toBe(400);
      const ok = await post('/api/clientes', admin.token, {
        nombre: 'Logística Sur', tipo: 'empresa', ruc: '1790000000001', razon_social: 'Logística Sur Cía. Ltda.'
      });
      expect(ok.status).toBe(201);
      expect(ok.body.data.tipo).toBe('empresa');
      const repetida = await post('/api/clientes', admin.token, { nombre: 'Copia', tipo: 'empresa', ruc: '1790000000001' });
      expect(repetida.status).toBe(409);
    });

    test('no deja pasar a persona una empresa con lavados sin cortar', async () => {
      const id = (await reservarFlota()).body.data.id;
      await completarEnPeriodo(id);
      const r = await put(`/api/clientes/${empresa.id}`, admin.token, { tipo: 'persona' });
      expect(r.status).toBe(400);
    });
  });
});
