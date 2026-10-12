/**
 * Lavado remoto a domicilio (fase 3 de la expansión).
 *
 * Lo que tiene que quedar garantizado:
 *   - el equipo móvil queda ocupado de la salida al regreso (traslado incluido)
 *     y no se le venden dos visitas que se pisan;
 *   - el precio suma el recargo del sector, una vez por visita;
 *   - sin agua y luz confirmadas no se agenda (salvo que el equipo las lleve);
 *   - los lavadores de un equipo no suman al expreso de la ciudad;
 *   - una visita fallida cobra el % del parámetro, no cuenta como lavado y sí
 *     como facturado;
 *   - el lavador opera las visitas de SU equipo, y el operador las de su ciudad.
 */

const bcrypt = require('bcryptjs');
const bd = require('../ayudas/bd');
const { app, request, entrar, con, enDias } = require('../ayudas/api');
const fechas = require('../../src/utils/fechas');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de lavado remoto.\n');
}

d('Lavado remoto', () => {
  let datos;
  let admin;
  let ana;
  let marta; // lavadora del equipo móvil
  let sector;
  let equipo;
  let manana;

  beforeEach(async () => {
    datos = await bd.sembrar();
    manana = enDias(1);
    const gye = datos.ciudades.guayaquil.id;
    sector = await bd.prisma.sector.create({ data: { id_ciudad: gye, nombre: 'Norte', traslado_min: 30, recargo: 3 } });
    equipo = await bd.prisma.unidadMovil.create({ data: { id_ciudad: gye, nombre: 'Equipo GYE 1' } });
    const lavadora = await bd.prisma.lavador.create({ data: { nombre: 'Marta Móvil', id_ciudad: gye, id_unidad: equipo.id } });
    await bd.prisma.usuario.create({
      data: { username: 'marta', password: await bcrypt.hash(bd.CLAVE, 4), rol: 'lavador', id_lavador: lavadora.id }
    });
    await bd.prisma.parametro.create({ data: { clave: 'remoto.cargo_visita_fallida_pct', valor: '100' } });
    [admin, ana, marta] = await Promise.all([entrar('admin'), entrar('ana@prueba.local'), entrar('marta')]);
  });
  afterAll(() => bd.desconectar());

  const get = (url, token) => con(request(app).get(url), token);
  const post = (url, token, body) => con(request(app).post(url), token).send(body);
  const put = (url, token, body) => con(request(app).put(url), token).send(body);

  const domicilio = (extra = {}) => ({
    id_sector: sector.id, direccion: 'Cdla. Kennedy, Mz 5 Villa 3', contacto_telefono: '0999999999',
    tiene_agua: true, tiene_luz: true, latitud: -2.17, longitud: -79.9, ...extra
  });
  const pedir = (hora = '09:00', extra = {}, token = ana.token, idVehiculo = datos.vehiculos.autoDeAna.id) =>
    post('/api/reservas', token, {
      id_vehiculo: idVehiculo, id_tipo_servicio: datos.servicios.expreso.id,
      fecha: manana, hora_inicio: hora, a_domicilio: domicilio(extra)
    });
  const disponibilidad = (dur = 60) => request(app).get('/api/agenda/disponibilidad')
    .query({ fecha: manana, modalidad: 'remoto', id_sector: sector.id, duracion_min: dur });
  const cupo = async (hora) => (await disponibilidad()).body.data.franjas.find((f) => f.hora_inicio === hora);

  describe('agenda del equipo', () => {
    test('las franjas dejan tiempo para ir y volver', async () => {
      const r = await disponibilidad();
      expect(r.status).toBe(200);
      expect(r.body.data.sector).toMatchObject({ recargo: 3, traslado_min: 30 });
      const horas = r.body.data.franjas.map((f) => f.hora_inicio);
      // Equipo de 07:00 a 18:00, 30 min de traslado: primera llegada 08:00 (07:30 redondeado), último regreso 18:00
      expect(horas[0]).toBe('08:00');
      expect(horas[horas.length - 1]).toBe('16:00');
    });

    test('un equipo no hace dos visitas que se pisan con el traslado', async () => {
      expect((await pedir('09:00')).status).toBe(201); // ocupa 08:30 a 10:30
      expect((await cupo('10:00')).disponible).toBe(false);
      const beto = await entrar('beto@prueba.local');
      const encima = await pedir('10:00', {}, beto.token, datos.vehiculos.autoDeBeto.id);
      expect(encima.status).toBe(409);
      // A las 11:00 sale a las 10:30, justo cuando volvió: entra
      expect((await pedir('11:00', {}, beto.token, datos.vehiculos.autoDeBeto.id)).status).toBe(201);
    });

    test('cancelar la reserva libera al equipo', async () => {
      const r = await pedir('09:00');
      expect((await put(`/api/reservas/${r.body.data.id}/cancelar`, ana.token, {})).status).toBe(200);
      expect((await bd.prisma.visita.findUnique({ where: { id: r.body.data.id_visita } })).estado).toBe('cancelada');
      expect((await cupo('09:00')).disponible).toBe(true);
    });

    test('los lavadores del equipo no suman al expreso de la ciudad', async () => {
      await bd.prisma.estacionamiento.update({ where: { id: datos.sitio.id }, data: { capacidad_expreso: 0 } });
      const r = await request(app).get('/api/agenda/disponibilidad')
        .query({ fecha: manana, modalidad: 'expreso', id_estacionamiento: datos.sitio.id });
      expect(r.body.data.capacidad).toBe(1); // solo Luis; Marta es del equipo móvil
    });

    test('sin equipo activo en la ciudad no hay franjas ni sector público', async () => {
      await bd.prisma.unidadMovil.update({ where: { id: equipo.id }, data: { estado: 'mantenimiento' } });
      expect((await disponibilidad()).body.data.franjas).toHaveLength(0);
      expect((await request(app).get('/api/public/sectores')).body.data).toHaveLength(0);
    });
  });

  describe('pedido a domicilio', () => {
    test('precio con recargo, ciudad del sector y visita programada', async () => {
      const r = await pedir();
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ modalidad: 'remoto', precio_final: 13, id_ciudad: datos.ciudades.guayaquil.id });
      expect(r.body.data.visita).toMatchObject({ estado: 'programada', hora_salida: '08:30', hora_regreso: '10:30', recargo: 3 });
      expect(r.body.data.id_estacionamiento).toBeNull();
    });

    test('sin agua o luz confirmadas no se agenda, salvo que el equipo las lleve', async () => {
      expect((await pedir('09:00', { tiene_agua: false })).status).toBe(400);
      await bd.prisma.unidadMovil.update({ where: { id: equipo.id }, data: { lleva_agua: true, lleva_energia: true } });
      expect((await pedir('09:00', { tiene_agua: false, tiene_luz: false })).status).toBe(201);
    });

    test('la limpieza profunda no es a domicilio, y la dirección es obligatoria', async () => {
      const profunda = await post('/api/reservas', ana.token, {
        id_vehiculo: datos.vehiculos.autoDeAna.id, id_tipo_servicio: datos.servicios.profunda.id,
        fecha: manana, hora_inicio: '09:00', a_domicilio: domicilio()
      });
      expect(profunda.status).toBe(400);
      expect((await pedir('09:00', { direccion: '  ' })).status).toBe(400);
    });

    test('una empresa paga su tarifa más el recargo, a crédito', async () => {
      const empresa = await bd.prisma.cliente.create({ data: { tipo: 'empresa', nombre: 'Flota SA', ruc: '0990000000001', email: 'flota@x.local' } });
      const auto = await bd.prisma.vehiculo.create({ data: { id_cliente: empresa.id, placa: 'GXX-1', id_tipo_vehiculo: datos.tipos.liviano.id } });
      await bd.prisma.usuario.create({ data: { username: 'flota@x.local', password: await bcrypt.hash(bd.CLAVE, 4), rol: 'cliente', id_cliente: empresa.id } });
      await bd.prisma.tarifaEmpresa.create({
        data: { id_cliente: empresa.id, id_tipo_servicio: datos.servicios.expreso.id, id_tipo_vehiculo: datos.tipos.liviano.id, precio: 7 }
      });
      const gestor = await entrar('flota@x.local');
      const r = await pedir('09:00', {}, gestor.token, auto.id);
      expect(r.body.data).toMatchObject({ precio_final: 10, forma_cobro: 'credito' });
    });
  });

  describe('operación en campo', () => {
    test('en camino → llegada con GPS → completada', async () => {
      const r = await pedir();
      const idVisita = r.body.data.id_visita;
      expect((await put(`/api/reservas/${r.body.data.id}/confirmar`, admin.token, {})).status).toBe(200);

      // La lavadora del equipo la ve en sus trabajos y en la hoja de ruta
      const trabajos = await get('/api/reservas/mis-trabajos', marta.token);
      expect(trabajos.body.data.map((x) => x.id)).toContain(r.body.data.id);

      expect((await put(`/api/visitas/${idVisita}/en-camino`, marta.token, {})).body.data.estado).toBe('en_camino');
      const llegada = await put(`/api/visitas/${idVisita}/llegada`, marta.token, { latitud: -2.1705, longitud: -79.9, precision: 12 });
      expect(llegada.body.data.estado).toBe('en_sitio');
      expect(llegada.body.data.distancia_m).toBeLessThan(100);

      expect((await put(`/api/reservas/${r.body.data.id}/iniciar`, marta.token, {})).status).toBe(200);
      expect((await put(`/api/reservas/${r.body.data.id}/completar`, marta.token, {})).status).toBe(200);
      expect((await bd.prisma.visita.findUnique({ where: { id: idVisita } })).estado).toBe('completada');
    });

    test('un lavador de fuera del equipo no opera la visita', async () => {
      const r = await pedir();
      const luis = await entrar('luis');
      expect((await put(`/api/visitas/${r.body.data.id_visita}/en-camino`, luis.token, {})).status).toBe(403);
      expect((await get(`/api/reservas/${r.body.data.id}`, luis.token)).status).toBe(403);
    });

    test('el operador de otra ciudad no la ve ni la opera', async () => {
      const r = await pedir();
      const opQuito = await entrar('opquito');
      expect((await get(`/api/visitas?fecha=${manana}`, opQuito.token)).body.data).toHaveLength(0);
      expect((await put(`/api/visitas/${r.body.data.id_visita}/en-camino`, opQuito.token, {})).status).toBe(403);
      expect((await post('/api/sectores', opQuito.token, { nombre: 'Sur', id_ciudad: datos.ciudades.guayaquil.id })).status).toBe(403);
    });
  });

  describe('visita fallida', () => {
    // La visita tiene que haber empezado: se lleva a ayer
    const aAyer = async (r) => {
      const ayer = fechas.sumarDias(fechas.hoy(), -1);
      await bd.prisma.reserva.update({ where: { id: r.body.data.id }, data: { fecha: ayer } });
      await bd.prisma.visita.update({ where: { id: r.body.data.id_visita }, data: { fecha: ayer } });
    };

    test('cobra el % del parámetro, no es un lavado y sí se factura', async () => {
      expect((await put('/api/parametros/remoto.cargo_visita_fallida_pct', admin.token, { valor: 50 })).status).toBe(200);
      const r = await pedir();
      await aAyer(r);
      const f = await put(`/api/visitas/${r.body.data.id_visita}/fallida`, admin.token, { motivo: 'Sin acceso al conjunto' });
      expect(f.status).toBe(200);
      const reserva = await bd.prisma.reserva.findUnique({ where: { id: r.body.data.id } });
      expect(reserva).toMatchObject({ estado: 'fallida', precio_final: 6.5 });

      const ayer = fechas.aISO(fechas.sumarDias(fechas.hoy(), -1));
      const resumen = (await get(`/api/reportes/resumen?desde=${ayer}&hasta=${ayer}`, admin.token)).body.data;
      expect(resumen).toMatchObject({ lavados: 0, facturado: 6.5, visitas_fallidas: 1 });

      const reporte = (await get(`/api/visitas/reporte?desde=${ayer}&hasta=${ayer}`, admin.token)).body.data;
      expect(reporte.causas_fallidas).toEqual([{ motivo: 'Sin acceso al conjunto', cantidad: 1 }]);
      expect(reporte.por_equipo[0]).toMatchObject({ nombre: 'Equipo GYE 1', fallidas: 1, min_traslado: 60 });
    });

    test('el cargo de una visita fallida se paga como cualquier lavado', async () => {
      const r = await pedir();
      await aAyer(r);
      await put(`/api/visitas/${r.body.data.id_visita}/fallida`, admin.token, { motivo: 'No estaba el vehículo' });
      const operador = await entrar('operador');
      const pago = await post(`/api/reservas/${r.body.data.id}/pagos`, operador.token, { monto: 13, metodo: 'efectivo' });
      expect(pago.status).toBe(201);
    });

    test('pide motivo, y no se marca antes de que empiece', async () => {
      const r = await pedir();
      expect((await put(`/api/visitas/${r.body.data.id_visita}/fallida`, admin.token, { motivo: 'x' })).status).toBe(400); // es mañana
      await aAyer(r);
      expect((await put(`/api/visitas/${r.body.data.id_visita}/fallida`, admin.token, {})).status).toBe(400);
    });

    test('el parámetro solo acepta un porcentaje', async () => {
      expect((await put('/api/parametros/remoto.cargo_visita_fallida_pct', admin.token, { valor: 150 })).status).toBe(400);
      const operador = await entrar('operador');
      expect((await put('/api/parametros/remoto.cargo_visita_fallida_pct', operador.token, { valor: 50 })).status).toBe(403);
    });
  });
});
