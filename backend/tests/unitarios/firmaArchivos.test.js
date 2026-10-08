/**
 * utils/firmaArchivos — lo que protege las fotos de los vehículos y, sobre todo,
 * los comprobantes de transferencia (llevan datos bancarios del cliente).
 *
 * Como /uploads se consume desde <img src="...">, no hay header Authorization:
 * la única defensa es que la URL venga firmada y vigente.
 */

const { firmar, firmarListaJSON, firmarReserva, verificarFirma } = require('../../src/utils/firmaArchivos');

// Simula el middleware montado en /uploads: req.path llega relativo al mount.
const pedir = (url) => {
  const [ruta, query] = url.replace('/uploads', '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const req = { path: ruta, query: params };
  const res = { codigo: null, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  let paso = false;
  verificarFirma(req, res, () => { paso = true; });
  return { paso, codigo: res.codigo, mensaje: res.cuerpo?.message };
};

describe('firmar', () => {
  test('agrega exp y sig a una ruta de /uploads', () => {
    const url = firmar('/uploads/comprobantes/abc.jpg');
    expect(url).toMatch(/^\/uploads\/comprobantes\/abc\.jpg\?exp=\d+&sig=[a-f0-9]{32}$/);
  });

  test('deja en paz lo que no es una ruta de /uploads', () => {
    expect(firmar(null)).toBeNull();
    expect(firmar('')).toBe('');
    expect(firmar('https://otro.sitio/foto.jpg')).toBe('https://otro.sitio/foto.jpg');
  });

  test('firmarListaJSON firma cada ruta del arreglo guardado', () => {
    const firmadas = JSON.parse(firmarListaJSON(JSON.stringify(['/uploads/a.jpg', '/uploads/b.jpg'])));
    expect(firmadas).toHaveLength(2);
    firmadas.forEach((u) => expect(u).toContain('sig='));
  });

  test('firmarListaJSON no rompe si el campo no es un JSON válido', () => {
    expect(firmarListaJSON('esto no es json')).toBe('esto no es json');
    expect(firmarListaJSON(null)).toBeNull();
  });

  test('firmarReserva firma la evidencia y los comprobantes de pago', () => {
    const r = firmarReserva({
      id: 1,
      registro: { fotos_antes: JSON.stringify(['/uploads/antes.jpg']), fotos_despues: null },
      pagos: [{ id: 1, comprobante_url: '/uploads/comprobantes/x.pdf' }]
    });
    expect(r.registro.fotos_antes).toContain('sig=');
    expect(r.pagos[0].comprobante_url).toContain('sig=');
  });
});

describe('verificarFirma', () => {
  test('deja pasar una firma válida y vigente', () => {
    expect(pedir(firmar('/uploads/comprobantes/abc.jpg')).paso).toBe(true);
  });

  test('sin firma, 403', () => {
    const r = pedir('/uploads/comprobantes/abc.jpg');
    expect(r.paso).toBe(false);
    expect(r.codigo).toBe(403);
  });

  test('con la firma de OTRO archivo, 403', () => {
    // El ataque obvio: tomar el enlace firmado propio y cambiarle el nombre al
    // archivo para ver el comprobante de otro cliente.
    const propia = firmar('/uploads/comprobantes/mio.jpg').split('?')[1];
    const r = pedir(`/uploads/comprobantes/ajeno.jpg?${propia}`);
    expect(r.paso).toBe(false);
    expect(r.codigo).toBe(403);
  });

  test('con la firma alterada, 403', () => {
    const url = firmar('/uploads/a.jpg').replace(/sig=./, 'sig=0');
    expect(pedir(url).codigo).toBe(403);
  });

  test('una firma de largo distinto no revienta el timingSafeEqual', () => {
    expect(pedir('/uploads/a.jpg?exp=' + (Date.now() + 1000) + '&sig=corta').codigo).toBe(403);
  });

  test('vencida, 403 con un mensaje que explica qué hacer', () => {
    const r = pedir(`/uploads/a.jpg?exp=${Date.now() - 1000}&sig=loquesea`);
    expect(r.codigo).toBe(403);
    expect(r.mensaje).toMatch(/caduc/i);
  });

  test('alargar la vigencia a mano no sirve: la fecha está dentro de la firma', () => {
    const url = firmar('/uploads/a.jpg');
    const exp = new URLSearchParams(url.split('?')[1]);
    const adulterada = `/uploads/a.jpg?exp=${Number(exp.get('exp')) + 999999}&sig=${exp.get('sig')}`;
    expect(pedir(adulterada).codigo).toBe(403);
  });
});
