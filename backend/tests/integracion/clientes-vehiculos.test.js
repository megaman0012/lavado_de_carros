/**
 * Clientes y sus vehículos.
 *
 * Incluye lo que se agregó para que el administrador pueda ver qué vehículos
 * tiene cada cliente: el listado de clientes trae los vehículos con el tipo ya
 * resuelto (de él dependen los precios) y ordenados por placa, que es lo que la
 * pantalla despliega al abrir la fila.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de clientes.\n');
}

d('Clientes y vehículos', () => {
  let datos;
  let admin;
  let operador;
  let ana;

  beforeEach(async () => {
    datos = await bd.sembrar();
    [admin, operador, ana] = await Promise.all([entrar('admin'), entrar('operador'), entrar('ana@prueba.local')]);
  });
  afterAll(() => bd.desconectar());

  describe('el panel ve los vehículos de cada cliente', () => {
    test('el listado de clientes trae los vehículos de cada uno', async () => {
      const r = await con(request(app).get('/api/clientes'), admin.token);
      expect(r.status).toBe(200);

      const anaEnLista = r.body.data.find((c) => c.id === datos.clientes.ana.id);
      expect(anaEnLista.vehiculos).toHaveLength(2);
      expect(anaEnLista.vehiculos.map((v) => v.placa)).toEqual(['ABC-1234', 'MOT-0001']);
    });

    test('cada vehículo viene con su tipo resuelto, no solo con el id', async () => {
      // La pantalla muestra "Liviano" y el ícono según el código; sin esto habría
      // que pedir el catálogo aparte y cruzarlo en el navegador.
      const r = await con(request(app).get('/api/clientes'), admin.token);
      const auto = r.body.data
        .find((c) => c.id === datos.clientes.ana.id)
        .vehiculos.find((v) => v.placa === 'ABC-1234');

      expect(auto.tipoVehiculo).toMatchObject({ codigo: 'liviano', nombre: 'Liviano' });
      expect(auto.marca).toBe('Chevrolet');
      expect(auto.modelo).toBe('Sail');
      expect(auto.color).toBe('Blanco');
    });

    test('los vehículos vienen ordenados por placa', async () => {
      await bd.prisma.vehiculo.create({
        data: { id_cliente: datos.clientes.ana.id, placa: 'AAA-0001', id_tipo_vehiculo: datos.tipos.liviano.id }
      });
      const r = await con(request(app).get('/api/clientes'), admin.token);
      const placas = r.body.data.find((c) => c.id === datos.clientes.ana.id).vehiculos.map((v) => v.placa);
      expect(placas).toEqual([...placas].sort());
    });

    test('un vehículo dado de baja sigue apareciendo, marcado como inactivo', async () => {
      // No se ocultan: las reservas históricas los referencian y el operador
      // tiene que poder entender un historial viejo.
      await con(request(app).delete(`/api/vehiculos/${datos.vehiculos.motoDeAna.id}`), admin.token);

      const r = await con(request(app).get('/api/clientes'), admin.token);
      const vehiculos = r.body.data.find((c) => c.id === datos.clientes.ana.id).vehiculos;
      expect(vehiculos).toHaveLength(2);
      expect(vehiculos.find((v) => v.placa === 'MOT-0001').estado).toBe('inactivo');
    });

    test('un cliente sin vehículos devuelve una lista vacía, no null', async () => {
      const sinAutos = await bd.prisma.cliente.create({ data: { nombre: 'Sin Autos' } });
      const r = await con(request(app).get('/api/clientes'), admin.token);
      expect(r.body.data.find((c) => c.id === sinAutos.id).vehiculos).toEqual([]);
    });

    test('la ficha individual del cliente trae lo mismo', async () => {
      const r = await con(request(app).get(`/api/clientes/${datos.clientes.ana.id}`), admin.token);
      expect(r.status).toBe(200);
      expect(r.body.data.vehiculos).toHaveLength(2);
      expect(r.body.data.vehiculos[0].tipoVehiculo.nombre).toBeTruthy();
    });

    test('el buscador filtra por nombre, email o cédula', async () => {
      const porNombre = await con(request(app).get('/api/clientes?busqueda=ana'), admin.token);
      expect(porNombre.body.data).toHaveLength(1);
      expect(porNombre.body.data[0].nombre).toBe('Ana Vera');

      const porCedula = await con(request(app).get('/api/clientes?busqueda=0910000002'), admin.token);
      expect(porCedula.body.data[0].nombre).toBe('Beto Ruiz');
    });

    test('el listado nunca incluye la contraseña de la cuenta', async () => {
      const r = await con(request(app).get('/api/clientes'), admin.token);
      expect(JSON.stringify(r.body)).not.toMatch(/"password"/);
    });

    test('un cliente no puede ver la lista de clientes ni los vehículos de otros', async () => {
      expect((await con(request(app).get('/api/clientes'), ana.token)).status).toBe(403);
      expect((await con(request(app).get(`/api/clientes/${datos.clientes.beto.id}`), ana.token)).status).toBe(403);
    });

    test('sin sesión tampoco', async () => {
      expect((await request(app).get('/api/clientes')).status).toBe(401);
    });
  });

  describe('alta de vehículos desde el panel', () => {
    test('el operador registra un vehículo a nombre de un cliente', async () => {
      const r = await con(request(app).post('/api/vehiculos'), operador.token).send({
        id_cliente: datos.clientes.beto.id,
        placa: 'nue-0001',
        marca: 'Mazda',
        id_tipo_vehiculo: datos.tipos.liviano.id
      });
      expect(r.status).toBe(201);
      expect(r.body.data.placa).toBe('NUE-0001'); // se guarda en mayúsculas
      expect(r.body.data.id_cliente).toBe(datos.clientes.beto.id);

      const lista = await con(request(app).get('/api/clientes'), admin.token);
      expect(lista.body.data.find((c) => c.id === datos.clientes.beto.id).vehiculos).toHaveLength(2);
    });

    test('el tipo de vehículo es obligatorio: de él dependen los precios', async () => {
      const r = await con(request(app).post('/api/vehiculos'), operador.token)
        .send({ id_cliente: datos.clientes.beto.id, placa: 'SIN-0001' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/tipo/i);
    });

    test('un tipo inexistente o desactivado se rechaza', async () => {
      await bd.prisma.tipoVehiculo.update({ where: { id: datos.tipos.moto.id }, data: { activo: false } });
      const inactivo = await con(request(app).post('/api/vehiculos'), operador.token)
        .send({ id_cliente: datos.clientes.beto.id, placa: 'INA-0001', id_tipo_vehiculo: datos.tipos.moto.id });
      const inexistente = await con(request(app).post('/api/vehiculos'), operador.token)
        .send({ id_cliente: datos.clientes.beto.id, placa: 'INE-0001', id_tipo_vehiculo: 9999 });
      expect(inactivo.status).toBe(400);
      expect(inexistente.status).toBe(400);
    });

    test('la placa no se puede repetir', async () => {
      const r = await con(request(app).post('/api/vehiculos'), operador.token).send({
        id_cliente: datos.clientes.beto.id,
        placa: 'ABC-1234', // ya es de Ana
        id_tipo_vehiculo: datos.tipos.liviano.id
      });
      expect(r.status).toBe(409);
    });

    test('el operador corrige el tipo de un vehículo', async () => {
      const r = await con(request(app).put(`/api/vehiculos/${datos.vehiculos.autoDeAna.id}`), operador.token)
        .send({ id_tipo_vehiculo: datos.tipos.moto.id, color: 'Rojo' });
      expect(r.status).toBe(200);
      expect(r.body.data.tipoVehiculo.codigo).toBe('moto');
      expect(r.body.data.color).toBe('Rojo');
    });

    test('dar de baja un vehículo lo desactiva, no lo borra', async () => {
      await con(request(app).delete(`/api/vehiculos/${datos.vehiculos.motoDeAna.id}`), admin.token);
      const enBd = await bd.prisma.vehiculo.findUnique({ where: { id: datos.vehiculos.motoDeAna.id } });
      expect(enBd).not.toBeNull();
      expect(enBd.estado).toBe('inactivo');
    });

    test('un cliente no puede dar de baja vehículos', async () => {
      expect((await con(request(app).delete(`/api/vehiculos/${datos.vehiculos.autoDeAna.id}`), ana.token)).status).toBe(403);
    });
  });

  describe('el cliente y sus propios vehículos', () => {
    test('solo ve los suyos, y solo los activos', async () => {
      await bd.prisma.vehiculo.update({ where: { id: datos.vehiculos.motoDeAna.id }, data: { estado: 'inactivo' } });
      const r = await con(request(app).get('/api/vehiculos'), ana.token);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].placa).toBe('ABC-1234');
    });

    test('pedir los de otro cliente por querystring no funciona', async () => {
      const r = await con(request(app).get(`/api/vehiculos?id_cliente=${datos.clientes.beto.id}`), ana.token);
      expect(r.body.data.every((v) => v.id_cliente === datos.clientes.ana.id)).toBe(true);
    });

    test('al registrar uno, se le asigna a sí mismo aunque mande otro id_cliente', async () => {
      const r = await con(request(app).post('/api/vehiculos'), ana.token).send({
        id_cliente: datos.clientes.beto.id, // intento de registrarlo a nombre de otro
        placa: 'MIO-0001',
        id_tipo_vehiculo: datos.tipos.liviano.id
      });
      expect(r.status).toBe(201);
      expect(r.body.data.id_cliente).toBe(datos.clientes.ana.id);
    });

    test('puede completar el tipo del suyo, pero no tocar el de otro', async () => {
      const propio = await con(request(app).put(`/api/vehiculos/${datos.vehiculos.autoDeAna.id}`), ana.token)
        .send({ id_tipo_vehiculo: datos.tipos.moto.id });
      const ajeno = await con(request(app).put(`/api/vehiculos/${datos.vehiculos.autoDeBeto.id}`), ana.token)
        .send({ id_tipo_vehiculo: datos.tipos.moto.id });
      expect(propio.status).toBe(200);
      expect(ajeno.status).toBe(403);
    });

    test('no puede reactivar un vehículo que el panel dio de baja', async () => {
      await bd.prisma.vehiculo.update({ where: { id: datos.vehiculos.autoDeAna.id }, data: { estado: 'inactivo' } });
      await con(request(app).put(`/api/vehiculos/${datos.vehiculos.autoDeAna.id}`), ana.token).send({ estado: 'activo' });

      const enBd = await bd.prisma.vehiculo.findUnique({ where: { id: datos.vehiculos.autoDeAna.id } });
      expect(enBd.estado).toBe('inactivo');
    });
  });

  describe('gestión de la ficha del cliente', () => {
    test('el alta con acceso devuelve la contraseña provisional una sola vez', async () => {
      const r = await con(request(app).post('/api/clientes'), operador.token)
        .send({ nombre: 'Carlos Nuevo', email: 'carlos@prueba.local', crear_acceso: true });
      expect(r.status).toBe(201);
      expect(r.body.data.password_temporal).toBeTruthy();

      const ficha = await con(request(app).get(`/api/clientes/${r.body.data.id}`), operador.token);
      expect(ficha.body.data.password_temporal).toBeUndefined();
    });

    test('sin email no se puede crear el acceso', async () => {
      const r = await con(request(app).post('/api/clientes'), operador.token)
        .send({ nombre: 'Sin Correo', crear_acceso: true });
      expect(r.status).toBe(400);
    });

    test('suspender al cliente le cierra también la cuenta', async () => {
      await con(request(app).delete(`/api/clientes/${datos.clientes.ana.id}`), operador.token);
      const cuenta = await bd.prisma.usuario.findFirst({ where: { id_cliente: datos.clientes.ana.id } });
      expect(cuenta.estado).toBe('inactivo');

      const login = await request(app).post('/api/auth/login').send({ username: 'ana@prueba.local', password: bd.CLAVE });
      expect(login.status).toBe(403);
    });

    test('no se puede quitarle el email a quien lo usa para entrar', async () => {
      const r = await con(request(app).put(`/api/clientes/${datos.clientes.ana.id}`), operador.token).send({ email: '' });
      expect(r.status).toBe(400);
    });

    test('cambiar el email cambia también el usuario de ingreso', async () => {
      const r = await con(request(app).put(`/api/clientes/${datos.clientes.ana.id}`), operador.token)
        .send({ email: 'ana.nueva@prueba.local' });
      expect(r.status).toBe(200);

      const login = await request(app).post('/api/auth/login')
        .send({ username: 'ana.nueva@prueba.local', password: bd.CLAVE });
      expect(login.status).toBe(200);
    });

    test('solo el admin restablece contraseñas, no el operador', async () => {
      expect((await con(request(app).post(`/api/clientes/${datos.clientes.ana.id}/acceso`), operador.token)).status).toBe(403);
      expect((await con(request(app).post(`/api/clientes/${datos.clientes.ana.id}/acceso`), admin.token)).status).toBe(200);
    });
  });
});
