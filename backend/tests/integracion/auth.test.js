/**
 * Autenticación y sesión (POST /api/auth/*).
 *
 * Cubre lo que se agregó al cerrar el ítem #15 del plan: el token de acceso dura
 * 15 minutos y la sesión se sostiene con un refresh token revocable, que rota en
 * cada uso y detecta cuando alguien reusa una copia.
 */

const jwt = require('jsonwebtoken');
const bd = require('../ayudas/bd');
const { app, request, entrar, con } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de auth.\n');
}

d('Autenticación', () => {
  let datos;
  beforeEach(async () => { datos = await bd.sembrar(); });
  afterAll(() => bd.desconectar());

  describe('login', () => {
    test('con credenciales correctas devuelve acceso, refresco y el usuario', async () => {
      const r = await request(app).post('/api/auth/login').send({ username: 'admin', password: bd.CLAVE });
      expect(r.status).toBe(200);
      expect(r.body.data.usuario.rol).toBe('admin');
      expect(typeof r.body.data.token).toBe('string');
      expect(typeof r.body.data.refresh_token).toBe('string');
      // El refresh token es opaco (48 bytes en hexadecimal), no un JWT.
      expect(r.body.data.refresh_token).toMatch(/^[a-f0-9]{96}$/);
    });

    test('el token de acceso dura minutos, no un día', async () => {
      const { token } = await entrar('admin');
      const { iat, exp } = jwt.decode(token);
      expect(exp - iat).toBeLessThanOrEqual(15 * 60);
    });

    test('el usuario no distingue mayúsculas ni espacios sobrantes', async () => {
      const r = await request(app).post('/api/auth/login').send({ username: '  ANA@prueba.local ', password: bd.CLAVE });
      expect(r.status).toBe(200);
    });

    test('contraseña incorrecta: 401 sin decir si la cuenta existe', async () => {
      const existente = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'otra' });
      const inventada = await request(app).post('/api/auth/login').send({ username: 'nadie', password: 'otra' });
      expect(existente.status).toBe(401);
      expect(inventada.status).toBe(401);
      expect(existente.body.message).toBe(inventada.body.message);
    });

    test('faltando datos: 400', async () => {
      const r = await request(app).post('/api/auth/login').send({ username: 'admin' });
      expect(r.status).toBe(400);
    });

    test('un cliente suspendido no entra, y se le explica por qué', async () => {
      await bd.prisma.cliente.update({ where: { id: datos.clientes.ana.id }, data: { estado: 'inactivo' } });
      const r = await request(app).post('/api/auth/login').send({ username: 'ana@prueba.local', password: bd.CLAVE });
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/suspendida/i);
    });

    test('la contraseña nunca viaja en la respuesta', async () => {
      const r = await request(app).post('/api/auth/login').send({ username: 'admin', password: bd.CLAVE });
      expect(JSON.stringify(r.body)).not.toContain(bd.CLAVE);
    });
  });

  describe('rutas protegidas', () => {
    test('sin token, 401', async () => {
      expect((await request(app).get('/api/clientes')).status).toBe(401);
    });

    test('con un token inventado, 401', async () => {
      const r = await con(request(app).get('/api/clientes'), 'esto.no.es.un.token');
      expect(r.status).toBe(401);
    });

    test('con un token firmado con otro secreto, 401', async () => {
      const ajeno = jwt.sign({ id: 1, rol: 'admin' }, 'otro-secreto', { expiresIn: '1h' });
      expect((await con(request(app).get('/api/clientes'), ajeno)).status).toBe(401);
    });

    test('con un token vencido, 401', async () => {
      const vencido = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
      expect((await con(request(app).get('/api/clientes'), vencido)).status).toBe(401);
    });

    test('un cliente no entra al panel interno: 403', async () => {
      const { token } = await entrar('ana@prueba.local');
      expect((await con(request(app).get('/api/clientes'), token)).status).toBe(403);
    });

    test('suspender a alguien le corta el acceso en el acto, sin esperar a que venza el token', async () => {
      const { token } = await entrar('ana@prueba.local');
      expect((await con(request(app).get('/api/mis-reservas'), token)).status).toBe(200);

      await bd.prisma.cliente.update({ where: { id: datos.clientes.ana.id }, data: { estado: 'inactivo' } });

      const despues = await con(request(app).get('/api/mis-reservas'), token);
      expect(despues.status).toBe(401);
    });
  });

  describe('refresh token', () => {
    test('canjea el refresco por un acceso nuevo', async () => {
      const sesion = await entrar('admin');
      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(r.status).toBe(200);
      expect(r.body.data.usuario.rol).toBe('admin');
      // El token nuevo sirve de verdad
      expect((await con(request(app).get('/api/clientes'), r.body.data.token)).status).toBe(200);
    });

    test('rota: el refresco usado queda quemado y se entrega otro', async () => {
      const sesion = await entrar('admin');
      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(r.body.data.refresh_token).not.toBe(sesion.refresh_token);

      const reusado = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(reusado.status).toBe(401);
    });

    test('reusar un refresco viejo mata la sesión entera, no solo esa copia', async () => {
      // El escenario real: alguien copió el token. Cuando la copia se usa, el
      // token legítimo —que ya había rotado— también tiene que dejar de servir.
      const sesion = await entrar('admin');
      const r1 = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      const vigente = r1.body.data.refresh_token;

      await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token }); // el robado

      const r2 = await request(app).post('/api/auth/refresh').send({ refresh_token: vigente });
      expect(r2.status).toBe(401);
      expect(r2.body.message).toMatch(/indebido/i);
    });

    test('un refresco inventado o vacío: 401', async () => {
      expect((await request(app).post('/api/auth/refresh').send({ refresh_token: 'a'.repeat(96) })).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').send({})).status).toBe(401);
    });

    test('un refresco vencido: 401', async () => {
      const sesion = await entrar('admin');
      await bd.prisma.refreshToken.updateMany({ data: { expira: new Date(Date.now() - 1000) } });
      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(r.status).toBe(401);
      expect(r.body.message).toMatch(/expir/i);
    });

    test('no se puede renovar la sesión de una cuenta suspendida', async () => {
      const sesion = await entrar('ana@prueba.local');
      await bd.prisma.cliente.update({ where: { id: datos.clientes.ana.id }, data: { estado: 'inactivo' } });
      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(r.status).toBe(401);
      expect(r.body.message).toMatch(/suspendida/i);
    });

    test('en la base solo queda el hash, nunca el token entregado', async () => {
      const sesion = await entrar('admin');
      const guardados = await bd.prisma.refreshToken.findMany();
      expect(guardados).toHaveLength(1);
      expect(guardados[0].token_hash).not.toBe(sesion.refresh_token);
      expect(guardados[0].token_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256
    });
  });

  describe('cerrar sesión', () => {
    test('revoca el refresco en el servidor, no solo en este navegador', async () => {
      const sesion = await entrar('admin');
      const salida = await request(app).post('/api/auth/logout').send({ refresh_token: sesion.refresh_token });
      expect(salida.status).toBe(200);

      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesion.refresh_token });
      expect(r.status).toBe(401);
    });

    test('responde 200 aunque el token no exista: cerrar sesión no puede fallar', async () => {
      const r = await request(app).post('/api/auth/logout').send({ refresh_token: 'b'.repeat(96) });
      expect(r.status).toBe(200);
    });

    test('cerrar sesión en un dispositivo no cierra la del otro', async () => {
      const celular = await entrar('admin');
      const compu = await entrar('admin');
      await request(app).post('/api/auth/logout').send({ refresh_token: celular.refresh_token });

      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: compu.refresh_token });
      expect(r.status).toBe(200);
    });
  });

  describe('restablecer la contraseña', () => {
    test('corta las sesiones abiertas con la contraseña anterior', async () => {
      // Si no, quien tenía el acceso robado seguiría renovándolo por días y
      // cambiar la contraseña no habría servido de nada.
      const sesionDeAna = await entrar('ana@prueba.local');
      const { token: tokenAdmin } = await entrar('admin');

      const reset = await con(request(app).post(`/api/clientes/${datos.clientes.ana.id}/acceso`), tokenAdmin);
      expect(reset.status).toBe(200);

      const r = await request(app).post('/api/auth/refresh').send({ refresh_token: sesionDeAna.refresh_token });
      expect(r.status).toBe(401);
    });

    test('la contraseña provisional nueva sí sirve para entrar', async () => {
      const { token: tokenAdmin } = await entrar('admin');
      const reset = await con(request(app).post(`/api/clientes/${datos.clientes.ana.id}/acceso`), tokenAdmin);
      const nueva = reset.body.data.password_temporal;

      const r = await request(app).post('/api/auth/login').send({ username: 'ana@prueba.local', password: nueva });
      expect(r.status).toBe(200);
    });
  });

  describe('registro público', () => {
    test('crea cliente + cuenta y abre sesión de una vez', async () => {
      const r = await request(app).post('/api/auth/registrar')
        .send({ nombre: 'Carla Nueva', email: 'carla@prueba.local', password: 'clave12345', telefono: '0988888888' });
      expect(r.status).toBe(201);
      expect(r.body.data.usuario.rol).toBe('cliente');
      expect(r.body.data.refresh_token).toBeTruthy();
    });

    test('no deja registrar dos veces el mismo email', async () => {
      const r = await request(app).post('/api/auth/registrar')
        .send({ nombre: 'Ana Otra', email: 'ana@prueba.local', password: 'clave12345' });
      expect(r.status).toBe(409);
    });

    test('faltando datos obligatorios: 400', async () => {
      const r = await request(app).post('/api/auth/registrar').send({ nombre: 'Sin correo' });
      expect(r.status).toBe(400);
    });
  });
});
