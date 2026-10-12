/**
 * Operación nacional por ciudades (fase 1 de la expansión).
 *
 * Lo que tiene que quedar garantizado:
 *   - la agenda no mezcla ciudades (lavadores, bahías, bloqueos);
 *   - un operador de ciudad no ve ni toca nada de otra, ni cambiando la URL;
 *   - lo que vale para todo el país (servicios, precios, ciudades, usuarios)
 *     solo lo cambia quien tiene alcance nacional;
 *   - los reportes se pueden cortar por ciudad y cuadran con el total.
 *
 * En el sembrado (tests/ayudas/bd.js) Guayaquil tiene los sitios, el taller y
 * el lavador Luis; Quito tiene un condominio y al lavador Pedro. "operador" es
 * nacional y "opquito" es el operador de Quito.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con, enDias } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de ciudades.\n');
}

d('Ciudades', () => {
  let datos;
  let admin;
  let operador;
  let opQuito;
  let ana;
  let manana;

  beforeEach(async () => {
    datos = await bd.sembrar();
    [admin, operador, opQuito, ana] = await Promise.all([
      entrar('admin'), entrar('operador'), entrar('opquito'), entrar('ana@prueba.local')
    ]);
    manana = enDias(1);
  });
  afterAll(() => bd.desconectar());

  const get = (url, token) => con(request(app).get(url), token);
  const post = (url, token, body) => con(request(app).post(url), token).send(body);
  const put = (url, token, body) => con(request(app).put(url), token).send(body);

  // Reserva expreso de Ana: en Guayaquil por defecto, o en el sitio que se pida
  const reservar = (idSitio = datos.sitio.id, hora = '09:00') =>
    post('/api/reservas', ana.token, {
      id_vehiculo: datos.vehiculos.autoDeAna.id,
      id_tipo_servicio: datos.servicios.expreso.id,
      id_estacionamiento: idSitio,
      fecha: manana,
      hora_inicio: hora
    });

  describe('sesión', () => {
    test('el login dice la ciudad del operador y del lavador; el nacional no tiene', async () => {
      expect(opQuito.usuario.ciudad).toMatchObject({ nombre: 'Quito' });
      expect(operador.usuario.ciudad).toBeNull();
      const luis = await entrar('luis');
      expect(luis.usuario.ciudad).toMatchObject({ nombre: 'Guayaquil' });
    });
  });

  describe('alcance del operador de ciudad', () => {
    test('en el listado de reservas solo ve las de su ciudad', async () => {
      expect((await reservar(datos.sitio.id)).status).toBe(201);
      expect((await reservar(datos.sitioQuito.id)).status).toBe(201);

      const suyas = await get('/api/reservas', opQuito.token);
      expect(suyas.body.data).toHaveLength(1);
      expect(suyas.body.data[0].estacionamiento.ciudad.nombre).toBe('Quito');

      const todas = await get('/api/reservas', operador.token);
      expect(todas.body.data).toHaveLength(2);
      // El nacional puede filtrar; el de ciudad no puede escaparse con ?id_ciudad
      const gye = await get(`/api/reservas?id_ciudad=${datos.ciudades.guayaquil.id}`, operador.token);
      expect(gye.body.data).toHaveLength(1);
      const truco = await get(`/api/reservas?id_ciudad=${datos.ciudades.guayaquil.id}`, opQuito.token);
      expect(truco.body.data.every((r) => r.estacionamiento.ciudad.nombre === 'Quito')).toBe(true);
    });

    test('una reserva de otra ciudad: ni verla, ni confirmarla, ni cobrarla', async () => {
      const r = await reservar(datos.sitio.id);
      const id = r.body.data.id;
      expect((await get(`/api/reservas/${id}`, opQuito.token)).status).toBe(403);
      expect((await put(`/api/reservas/${id}/confirmar`, opQuito.token, {})).status).toBe(403);
      expect((await post(`/api/reservas/${id}/pagos`, opQuito.token, { monto: 10, metodo: 'efectivo' })).status).toBe(403);
      expect((await get(`/api/reportes/reserva/${id}/acta.pdf`, opQuito.token)).status).toBe(403);
      // El nacional sí
      expect((await put(`/api/reservas/${id}/confirmar`, operador.token, {})).status).toBe(200);
    });

    test('no puede reservar a nombre de un cliente en un sitio de otra ciudad', async () => {
      const r = await post('/api/reservas', opQuito.token, {
        id_cliente: datos.clientes.ana.id,
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: datos.servicios.expreso.id,
        id_estacionamiento: datos.sitio.id,
        fecha: manana,
        hora_inicio: '09:00'
      });
      expect(r.status).toBe(403);
    });

    test('sitios y lavadores: solo los suyos, y da de alta solo en su ciudad', async () => {
      const sitios = await get('/api/estacionamientos', opQuito.token);
      expect(sitios.body.data.map((e) => e.nombre)).toEqual(['Condominio Quito']);
      const lavadores = await get('/api/lavadores', opQuito.token);
      expect(lavadores.body.data.map((l) => l.nombre)).toEqual(['Pedro Quiteño']);

      expect((await put(`/api/estacionamientos/${datos.sitio.id}`, opQuito.token, { nombre: 'X' })).status).toBe(403);
      expect((await put(`/api/lavadores/${datos.lavador.id}`, opQuito.token, { nombre: 'X' })).status).toBe(403);
      const sitioAjeno = await post('/api/estacionamientos', opQuito.token, {
        nombre: 'Sitio ajeno', id_ciudad: datos.ciudades.guayaquil.id
      });
      expect(sitioAjeno.status).toBe(403);

      // Un lavador nuevo sin ciudad queda en la del operador
      const nuevo = await post('/api/lavadores', opQuito.token, { nombre: 'Rosa Nueva' });
      expect(nuevo.status).toBe(201);
      expect(nuevo.body.data.id_ciudad).toBe(datos.ciudades.quito.id);
    });

    test('un sitio nuevo exige ciudad', async () => {
      const r = await post('/api/estacionamientos', admin.token, { nombre: 'Sin ciudad' });
      expect(r.status).toBe(400);
    });

    test('los catálogos nacionales los cambia solo lo nacional', async () => {
      const cambio = { nombre: 'Lavado expreso renombrado' };
      expect((await put(`/api/servicios/${datos.servicios.expreso.id}`, opQuito.token, cambio)).status).toBe(403);
      expect((await post('/api/ciudades', opQuito.token, { nombre: 'Cuenca' })).status).toBe(403);
      // Leer sí puede
      expect((await get('/api/servicios', opQuito.token)).status).toBe(200);
      expect((await get('/api/ciudades', opQuito.token)).status).toBe(200);
      expect((await put(`/api/servicios/${datos.servicios.expreso.id}`, operador.token, cambio)).status).toBe(200);
    });
  });

  describe('lavadores y ciudad', () => {
    test('no se asigna un lavador de otra ciudad', async () => {
      const r = await reservar(datos.sitio.id);
      const id = r.body.data.id;
      const ajeno = await put(`/api/reservas/${id}/asignar-lavador`, operador.token, { id_lavador: datos.lavadorQuito.id });
      expect(ajeno.status).toBe(400);
      expect(ajeno.body.message).toMatch(/otra ciudad/);
      const propio = await put(`/api/reservas/${id}/asignar-lavador`, operador.token, { id_lavador: datos.lavador.id });
      expect(propio.status).toBe(200);
    });

    test('trasladar un lavador mueve su capacidad de ciudad', async () => {
      const cap = async (idSitio) =>
        (await request(app).get('/api/agenda/disponibilidad')
          .query({ fecha: manana, modalidad: 'expreso', id_estacionamiento: idSitio })).body.data.capacidad;
      expect(await cap(datos.sitioQuito.id)).toBe(1);
      const r = await put(`/api/lavadores/${datos.lavador.id}`, admin.token, { id_ciudad: datos.ciudades.quito.id });
      expect(r.status).toBe(200);
      expect(await cap(datos.sitioQuito.id)).toBe(2);
    });
  });

  describe('bloqueos', () => {
    const bloquear = (token, extra = {}) =>
      post('/api/agenda/bloqueos', token, { fecha: manana, hora_inicio: '07:00', hora_fin: '18:00', ...extra });
    const cupos9 = async (idSitio) => {
      const r = await request(app).get('/api/agenda/disponibilidad')
        .query({ fecha: manana, modalidad: 'expreso', id_estacionamiento: idSitio });
      return r.body.data.franjas.find((f) => f.hora_inicio === '09:00').cupos;
    };

    test('el operador de ciudad bloquea su ciudad, no el país', async () => {
      const b = await bloquear(opQuito.token);
      expect(b.status).toBe(201);
      expect(b.body.data.id_ciudad).toBe(datos.ciudades.quito.id);
      expect(await cupos9(datos.sitioQuito.id)).toBe(0);
      expect(await cupos9(datos.sitio.id)).toBe(1); // Guayaquil sigue abierto
    });

    test('un bloqueo de sitio deja abiertos los demás sitios de la ciudad', async () => {
      const b = await bloquear(operador.token, { id_estacionamiento: datos.sitio.id });
      expect(b.status).toBe(201);
      expect(await cupos9(datos.sitio.id)).toBe(0);
      expect(await cupos9(datos.sitioAmplio.id)).toBe(2);
    });

    test('un bloqueo nacional lo crea y lo libera solo lo nacional', async () => {
      expect((await bloquear(opQuito.token, { id_ciudad: datos.ciudades.guayaquil.id })).status).toBe(403);
      const nacional = await bloquear(admin.token);
      expect(nacional.status).toBe(201);
      expect(nacional.body.data.id_ciudad).toBeNull();
      expect(await cupos9(datos.sitio.id)).toBe(0);
      expect(await cupos9(datos.sitioQuito.id)).toBe(0);

      const liberar = (token) => con(request(app).delete(`/api/agenda/bloqueos/${nacional.body.data.id}`), token);
      expect((await liberar(opQuito.token)).status).toBe(403);
      expect((await liberar(admin.token)).status).toBe(200);
    });

    test('la agenda del día del operador muestra su ciudad y los bloqueos nacionales', async () => {
      await reservar(datos.sitio.id);
      await reservar(datos.sitioQuito.id);
      await bloquear(admin.token, { hora_inicio: '17:00', hora_fin: '18:00' });
      const r = await get(`/api/agenda?fecha=${manana}`, opQuito.token);
      const conReserva = r.body.data.asignaciones.filter((a) => a.reserva);
      expect(conReserva).toHaveLength(1);
      expect(conReserva[0].reserva.estacionamiento.ciudad.nombre).toBe('Quito');
      expect(r.body.data.asignaciones.filter((a) => !a.reserva)).toHaveLength(1);
      // Capacidad del resumen: la de Quito (un lavador, ninguna bahía)
      expect(r.body.data.capacidades).toEqual({ expreso: 1, profunda: 0 });
    });
  });

  describe('reportes', () => {
    test('por ciudad: una fila por ciudad y la suma cuadra con el total', async () => {
      await reservar(datos.sitio.id, '09:00');
      await reservar(datos.sitioAmplio.id, '10:00');
      await reservar(datos.sitioQuito.id, '11:00');
      const q = `desde=${manana}&hasta=${manana}`;

      const filas = (await get(`/api/reportes/por-ciudad?${q}`, admin.token)).body.data;
      expect(filas.map((f) => [f.ciudad, f.lavados])).toEqual([['Guayaquil', 2], ['Quito', 1]]);
      const total = (await get(`/api/reportes/resumen?${q}`, admin.token)).body.data;
      expect(filas.reduce((t, f) => t + f.facturado, 0)).toBe(total.facturado);

      const soloGye = (await get(`/api/reportes/resumen?${q}&id_ciudad=${datos.ciudades.guayaquil.id}`, admin.token)).body.data;
      expect(soloGye.lavados).toBe(2);
    });

    test('el operador de ciudad recibe los reportes de su ciudad aunque pida otra', async () => {
      await reservar(datos.sitio.id, '09:00');
      await reservar(datos.sitioQuito.id, '11:00');
      const q = `desde=${manana}&hasta=${manana}&id_ciudad=${datos.ciudades.guayaquil.id}`;
      const resumen = (await get(`/api/reportes/resumen?${q}`, opQuito.token)).body.data;
      expect(resumen.lavados).toBe(1);
      const filas = (await get(`/api/reportes/por-ciudad?${q}`, opQuito.token)).body.data;
      expect(filas.map((f) => f.ciudad)).toEqual(['Quito']);
      const kpis = (await get('/api/reportes/kpis', opQuito.token)).body.data;
      expect(kpis.lavados_semana + kpis.lavados_mes).toBeGreaterThanOrEqual(1);
    });

    test('el Excel nacional trae la hoja por ciudad', async () => {
      await reservar(datos.sitio.id);
      const r = await get(`/api/reportes/exportar/excel?desde=${manana}&hasta=${manana}`, admin.token)
        .buffer(true).parse((res, cb) => {
          const partes = [];
          res.on('data', (c) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(r.status).toBe(200);
      const ExcelJS = require('exceljs');
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(r.body);
      expect(libro.getWorksheet('Por ciudad')).toBeDefined();
      expect(libro.getWorksheet('Resumen').getRow(2).getCell(2).value).toBe('Todo el país');
    });
  });

  describe('portal público', () => {
    test('ciudades con sitios, y sitios o talleres de una ciudad', async () => {
      await bd.prisma.ciudad.create({ data: { nombre: 'Cuenca' } }); // sin sitios: no se ofrece
      const ciudades = await request(app).get('/api/public/ciudades');
      expect(ciudades.body.data.map((c) => c.nombre)).toEqual(['Guayaquil', 'Quito']);

      const deGye = await request(app).get('/api/public/estacionamientos').query({ id_ciudad: datos.ciudades.guayaquil.id });
      expect(deGye.body.data.map((e) => e.nombre).sort()).toEqual(['Edificio Central', 'Torre Norte']);
      const talleres = await request(app).get('/api/public/estacionamientos')
        .query({ id_ciudad: datos.ciudades.guayaquil.id, tipo: 'taller' });
      expect(talleres.body.data.map((e) => e.nombre)).toEqual(['Taller Guayaquil']);
    });
  });

  describe('administración', () => {
    test('las ciudades se escriben de una sola forma', async () => {
      const r = await post('/api/ciudades', admin.token, { nombre: '  santo   DOMINGO ', provincia: 'Santo Domingo' });
      expect(r.status).toBe(201);
      expect(r.body.data.nombre).toBe('Santo Domingo');
      expect((await post('/api/ciudades', admin.token, { nombre: 'GUAYAQUIL' })).status).toBe(409);
    });

    test('el admin crea un operador para una ciudad y ese operador queda limitado a ella', async () => {
      const r = await post('/api/usuarios', admin.token, { username: 'OpGye', id_ciudad: datos.ciudades.guayaquil.id });
      expect(r.status).toBe(201);
      expect(r.body.data.username).toBe('opgye');
      expect(r.body.data.password_temporal).toBeTruthy();

      const opGye = await entrar('opgye', r.body.data.password_temporal);
      expect(opGye.usuario.ciudad).toMatchObject({ nombre: 'Guayaquil' });
      const sitios = await get('/api/estacionamientos', opGye.token);
      expect(sitios.body.data.every((e) => e.ciudad.nombre === 'Guayaquil')).toBe(true);

      // Trasladarlo a nacional (id_ciudad null) rige en la siguiente petición
      expect((await put(`/api/usuarios/${r.body.data.id}`, admin.token, { id_ciudad: null })).status).toBe(200);
      const todos = await get('/api/estacionamientos', opGye.token);
      expect(todos.body.data.length).toBeGreaterThan(sitios.body.data.length);
    });

    test('suspender un operador lo saca de inmediato', async () => {
      const usuarios = (await get('/api/usuarios', admin.token)).body.data;
      const id = usuarios.find((u) => u.username === 'opquito').id;
      expect((await put(`/api/usuarios/${id}`, admin.token, { estado: 'inactivo' })).status).toBe(200);
      expect((await get('/api/reservas', opQuito.token)).status).toBe(401);
    });

    test('usuarios internos: solo el admin', async () => {
      expect((await get('/api/usuarios', operador.token)).status).toBe(403);
      expect((await post('/api/usuarios', operador.token, { username: 'x' })).status).toBe(403);
    });

    test('el admin no se modifica a sí mismo desde usuarios internos', async () => {
      const r = await put(`/api/usuarios/${admin.usuario.id}`, admin.token, { estado: 'inactivo' });
      expect(r.status).toBe(400);
    });
  });
});
