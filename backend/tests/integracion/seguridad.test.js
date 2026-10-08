/**
 * Cabeceras de seguridad y acceso a los archivos subidos.
 *
 * Son las decisiones del ítem #15 del plan que no se ven en ninguna pantalla:
 * si alguien saca helmet o afloja la configuración de /uploads, nadie lo nota
 * hasta que es un problema. Esta prueba es la que lo nota.
 */

const bd = require('../ayudas/bd');
const { app, request } = require('../ayudas/api');

describe('Cabeceras de seguridad (helmet)', () => {
  test('el navegador no adivina el tipo de contenido', async () => {
    const r = await request(app).get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  test('la API no se puede meter en un iframe ajeno', async () => {
    const r = await request(app).get('/api/health');
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-frame-options']).toBeDefined();
  });

  test('no se anuncia que el servidor es Express', async () => {
    const r = await request(app).get('/api/health');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  test('las fotos y comprobantes se pueden mostrar desde la APK (otro origen)', async () => {
    // La app de Capacitor corre en https://localhost: con el valor por defecto
    // de helmet ('same-origin') el <img src> de /uploads quedaría bloqueado.
    const r = await request(app).get('/api/health');
    expect(r.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('no se manda HSTS mientras el despliegue sea HTTP', async () => {
    // Activarlo sin TLS no protege nada y deja el dominio clavado en HTTPS.
    const r = await request(app).get('/api/health');
    expect(r.headers['strict-transport-security']).toBeUndefined();
  });

  test('tampoco upgrade-insecure-requests: rompería Swagger UI sobre HTTP', async () => {
    // helmet lo pone por defecto; el navegador pediría por HTTPS los archivos de
    // /api/docs y la pantalla quedaría rota.
    const csp = (await request(app).get('/api/health')).headers['content-security-policy'];
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  test('la política de contenido permite lo que Swagger UI necesita', async () => {
    const csp = (await request(app).get('/api/health')).headers['content-security-policy'];
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe('Archivos subidos (/uploads)', () => {
  test('sin firma no se entrega nada, ni siquiera un 404 que confirme la ruta', async () => {
    const r = await request(app).get('/uploads/comprobantes/cualquiera.jpg');
    expect(r.status).toBe(403);
  });

  test('con una firma inventada tampoco', async () => {
    const r = await request(app).get(`/uploads/a.jpg?exp=${Date.now() + 100000}&sig=${'0'.repeat(32)}`);
    expect(r.status).toBe(403);
  });
});

describe('Errores', () => {
  test('una ruta inexistente responde el formato de siempre', async () => {
    const r = await request(app).get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body.success).toBe(false);
  });

  test('el health check responde sin sesión', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
});

afterAll(() => bd.desconectar());
