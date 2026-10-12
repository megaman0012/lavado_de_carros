/**
 * Reportes por período (GET /api/reportes/resumen y los agregados con desde/hasta).
 *
 * Lo que se cuida acá es el filtro por mes: que lo que se muestra sea
 * exactamente el período pedido, ni un día de más. Un reporte que mete un lavado
 * del mes anterior no se nota mirándolo —el número simplemente es otro— y
 * descuadra la caja.
 */

const bd = require('../ayudas/bd');
const { app, request, entrar, con } = require('../ayudas/api');

const d = bd.hayBD ? describe : describe.skip;
if (!bd.hayBD) {
  console.warn('\n⚠  Sin DATABASE_URL_TEST: se saltan las pruebas de integración de reportes.\n');
}

d('Reportes por período', () => {
  let datos;
  let admin;
  let ana;

  // Un mes cerrado y conocido, para que las pruebas no dependan de la fecha de hoy.
  const MES = { desde: '2026-03-01', hasta: '2026-03-31' };
  const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);

  // Crea una reserva directamente en la base: el endpoint de reservas no deja
  // crearlas en el pasado, y acá hacen falta meses ya cerrados.
  let secuencia = 0;
  const reservaEn = async (fecha, { precio = 10, estado = 'completada', idServicio, idSitio } = {}) => {
    secuencia += 1;
    return bd.prisma.reserva.create({
      data: {
        codigo: `RES-2026-${String(secuencia).padStart(5, '0')}`,
        id_cliente: datos.clientes.ana.id,
        id_vehiculo: datos.vehiculos.autoDeAna.id,
        id_tipo_servicio: idServicio || datos.servicios.expreso.id,
        id_estacionamiento: idSitio || datos.sitio.id,
        id_ciudad: datos.ciudades.guayaquil.id, // los sitios del sembrado son de Guayaquil
        modalidad: 'expreso',
        fecha: dia(fecha),
        hora_inicio: '09:00',
        hora_fin: '10:00',
        estado,
        precio_final: precio
      }
    });
  };

  const pagoEn = (idReserva, fecha, monto) => bd.prisma.pago.create({
    data: { id_reserva: idReserva, monto, metodo: 'efectivo', estado: 'aprobado', fecha_pago: dia(fecha) }
  });

  beforeEach(async () => {
    datos = await bd.sembrar();
    secuencia = 0;
    [admin, ana] = await Promise.all([entrar('admin'), entrar('ana@prueba.local')]);
  });
  afterAll(() => bd.desconectar());

  const resumen = (params = MES) => con(request(app).get('/api/reportes/resumen').query(params), admin.token);

  describe('resumen del mes', () => {
    test('cuenta solo los lavados del período pedido', async () => {
      await reservaEn('2026-02-28');          // mes anterior
      await reservaEn('2026-03-01');          // primer día: entra
      await reservaEn('2026-03-15');
      await reservaEn('2026-03-31');          // último día: entra
      await reservaEn('2026-04-01');          // mes siguiente

      const r = await resumen();
      expect(r.status).toBe(200);
      expect(r.body.data.lavados).toBe(3);
    });

    test('los bordes del mes se incluyen, no se quedan afuera', async () => {
      // El error clásico es usar "menor que el último día" y perder el día 31.
      await reservaEn('2026-03-31', { precio: 7 });
      const r = await resumen();
      expect(r.body.data.lavados).toBe(1);
      expect(r.body.data.facturado).toBe(7);
    });

    test('facturado suma el precio de los lavados del mes', async () => {
      await reservaEn('2026-03-05', { precio: 10 });
      await reservaEn('2026-03-06', { precio: 15.5 });
      const r = await resumen();
      expect(r.body.data.facturado).toBe(25.5);
    });

    test('cobrado son los pagos aprobados, y no tiene por qué coincidir con lo facturado', async () => {
      // Un lavado de marzo cobrado en abril: factura en marzo, cobra en abril.
      const deMarzo = await reservaEn('2026-03-28', { precio: 20 });
      await pagoEn(deMarzo.id, '2026-04-02', 20);
      // Y uno de marzo cobrado el mismo mes
      const otro = await reservaEn('2026-03-10', { precio: 10 });
      await pagoEn(otro.id, '2026-03-10', 10);

      const r = await resumen();
      expect(r.body.data.facturado).toBe(30);
      expect(r.body.data.cobrado).toBe(10);
    });

    test('un pago no aprobado no cuenta como cobrado', async () => {
      const reserva = await reservaEn('2026-03-10', { precio: 10 });
      await bd.prisma.pago.create({
        data: { id_reserva: reserva.id, monto: 10, metodo: 'transferencia', estado: 'en_verificacion', fecha_pago: dia('2026-03-10') }
      });
      const r = await resumen();
      expect(r.body.data.cobrado).toBe(0);
    });

    test('canceladas y no_asistio se cuentan aparte y no suman al facturado', async () => {
      await reservaEn('2026-03-05', { precio: 10 });
      await reservaEn('2026-03-06', { precio: 10, estado: 'cancelada' });
      await reservaEn('2026-03-07', { precio: 10, estado: 'no_asistio' });

      const r = await resumen();
      expect(r.body.data.lavados).toBe(1);
      expect(r.body.data.facturado).toBe(10);
      expect(r.body.data.canceladas).toBe(1);
      expect(r.body.data.no_asistio).toBe(1);
    });

    test('el ticket promedio es el facturado dividido por los lavados', async () => {
      await reservaEn('2026-03-05', { precio: 10 });
      await reservaEn('2026-03-06', { precio: 20 });
      const r = await resumen();
      expect(r.body.data.ticket_promedio).toBe(15);
    });

    test('sin lavados el ticket promedio es null, no cero', async () => {
      // Mostrar "$0.00" haría pensar que se trabajó gratis; no hubo trabajo.
      const r = await resumen();
      expect(r.body.data.lavados).toBe(0);
      expect(r.body.data.ticket_promedio).toBeNull();
      expect(r.body.data.facturado).toBe(0);
    });

    test('la calificación promedio solo mira las reservas del período', async () => {
      const marzo = await reservaEn('2026-03-10');
      const abril = await reservaEn('2026-04-10');
      await bd.prisma.calificacion.createMany({
        data: [
          { id_reserva: marzo.id, id_cliente: datos.clientes.ana.id, puntuacion: 4 },
          { id_reserva: abril.id, id_cliente: datos.clientes.ana.id, puntuacion: 2 }
        ]
      });

      const r = await resumen();
      expect(r.body.data.calificacion_promedio).toBe(4);
      expect(r.body.data.calificaciones_total).toBe(1);
    });

    test('devuelve el período que se consultó', async () => {
      const r = await resumen();
      expect(r.body.data.desde).toBe('2026-03-01');
      expect(r.body.data.hasta).toBe('2026-03-31');
    });
  });

  describe('los agregados respetan el mismo período', () => {
    test('por-servicio cuenta solo el mes pedido', async () => {
      await reservaEn('2026-03-05', { idServicio: datos.servicios.expreso.id });
      await reservaEn('2026-03-06', { idServicio: datos.servicios.expreso.id });
      await reservaEn('2026-02-05', { idServicio: datos.servicios.expreso.id });

      const r = await con(request(app).get('/api/reportes/por-servicio').query(MES), admin.token);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].cantidad).toBe(2);
    });

    test('por-estacionamiento separa los sitios dentro del mes', async () => {
      await reservaEn('2026-03-05', { idSitio: datos.sitio.id });
      await reservaEn('2026-03-06', { idSitio: datos.sitioAmplio.id });
      await reservaEn('2026-03-07', { idSitio: datos.sitioAmplio.id });

      const r = await con(request(app).get('/api/reportes/por-estacionamiento').query(MES), admin.token);
      const torre = r.body.data.find((s) => s.estacionamiento === 'Torre Norte');
      expect(torre.cantidad).toBe(2);
    });

    test('ingresos devuelve un punto por día con movimiento, ordenado', async () => {
      await reservaEn('2026-03-10', { precio: 10 });
      await reservaEn('2026-03-10', { precio: 5 });
      await reservaEn('2026-03-02', { precio: 8 });

      const r = await con(request(app).get('/api/reportes/ingresos').query(MES), admin.token);
      expect(r.body.data).toEqual([
        { fecha: '2026-03-02', total: 8 },
        { fecha: '2026-03-10', total: 15 }
      ]);
    });

    test('un mes sin movimiento devuelve listas vacías, no un error', async () => {
      const servicio = await con(request(app).get('/api/reportes/por-servicio').query(MES), admin.token);
      const ingresos = await con(request(app).get('/api/reportes/ingresos').query(MES), admin.token);
      expect(servicio.status).toBe(200);
      expect(servicio.body.data).toEqual([]);
      expect(ingresos.body.data).toEqual([]);
    });
  });

  describe('exportaciones', () => {
    test('el Excel se genera para el mes pedido', async () => {
      await reservaEn('2026-03-10', { precio: 10 });
      const r = await con(request(app).get('/api/reportes/exportar/excel').query(MES), admin.token);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/spreadsheet/);
    });

    test('el PDF también', async () => {
      await reservaEn('2026-03-10', { precio: 10 });
      const r = await con(request(app).get('/api/reportes/exportar/pdf').query(MES), admin.token);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/pdf/);
    });
  });

  describe('acceso', () => {
    test('un cliente no ve los reportes', async () => {
      expect((await con(request(app).get('/api/reportes/resumen').query(MES), ana.token)).status).toBe(403);
      expect((await con(request(app).get('/api/reportes/kpis'), ana.token)).status).toBe(403);
    });

    test('sin sesión tampoco', async () => {
      expect((await request(app).get('/api/reportes/resumen').query(MES)).status).toBe(401);
    });

    test('un lavador tampoco: ve sus trabajos, no la caja', async () => {
      const luis = await entrar('luis');
      expect((await con(request(app).get('/api/reportes/resumen').query(MES), luis.token)).status).toBe(403);
    });
  });
});
