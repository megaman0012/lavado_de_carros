/**
 * services/cotizacion — el único lugar donde se decide cuánto cuesta y cuánto
 * dura un lavado. Lo que se le muestra al cliente antes de reservar y lo que se
 * cobra salen de acá, así que un error de suma se cobra de verdad.
 *
 * Se le pasa un `db` de mentira: el servicio ya acepta uno para poder correr
 * dentro de la transacción de crear reserva.
 */

const { cotizar } = require('../../src/services/cotizacion.service');

const TIPO_LIVIANO = { id: 1, codigo: 'liviano', nombre: 'Liviano', activo: true };
const SERVICIO = { id: 10, nombre: 'Lavado expreso', modalidad: 'expreso', activo: true };

// Catálogo de mentira, con el mismo contrato que usa el servicio.
const dbFalso = ({ servicio = SERVICIO, tarifa, adicionales = [] } = {}) => ({
  tipoServicio: { findUnique: async () => servicio },
  precioServicio: {
    findUnique: async () => (tarifa === undefined
      ? { precio: 10, duracion_min: 60, activo: true, tipoVehiculo: TIPO_LIVIANO }
      : tarifa)
  },
  servicioAdicional: { findMany: async ({ where }) => adicionales.filter((a) => where.id.in.includes(a.id)) }
});

const ENCERADO = { id: 1, nombre: 'Encerado', precio: 5, duracion_min: 30, activo: true, orden_display: 1 };
const AROMA = { id: 2, nombre: 'Aromatizante', precio: 2.5, duracion_min: 0, activo: true, orden_display: 2 };

describe('cotizar', () => {
  test('sin adicionales, el total es el precio del servicio para ese tipo', async () => {
    const c = await cotizar({ idTipoServicio: 10, idTipoVehiculo: 1, db: dbFalso() });
    expect(c.precio_servicio).toBe(10);
    expect(c.precio_adicionales).toBe(0);
    expect(c.total).toBe(10);
    expect(c.duracion_min).toBe(60);
    expect(c.tipoVehiculo.nombre).toBe('Liviano');
  });

  test('los adicionales suman precio y minutos', async () => {
    const c = await cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1, adicionales: [1, 2],
      db: dbFalso({ adicionales: [ENCERADO, AROMA] })
    });
    expect(c.precio_adicionales).toBe(7.5);
    expect(c.total).toBe(17.5);
    // 60 del servicio + 30 del encerado; el aromatizante no agrega tiempo
    expect(c.duracion_min).toBe(90);
    expect(c.adicionales).toHaveLength(2);
  });

  test('un adicional repetido se cobra una sola vez', async () => {
    const c = await cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1, adicionales: [1, 1, 1],
      db: dbFalso({ adicionales: [ENCERADO] })
    });
    expect(c.adicionales).toHaveLength(1);
    expect(c.total).toBe(15);
  });

  test('los ids de adicionales pueden llegar como texto (vienen del JSON del navegador)', async () => {
    const c = await cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1, adicionales: ['1', '2'],
      db: dbFalso({ adicionales: [ENCERADO, AROMA] })
    });
    expect(c.total).toBe(17.5);
  });

  test('sin tipo de vehículo no se cotiza: de él depende el precio', async () => {
    // Es el caso de los vehículos cargados antes del catálogo de tipos.
    await expect(cotizar({ idTipoServicio: 10, idTipoVehiculo: null, db: dbFalso() }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('tipo') });
  });

  test('un servicio desactivado no se cotiza', async () => {
    await expect(cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1,
      db: dbFalso({ servicio: { ...SERVICIO, activo: false } })
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('un servicio sin tarifa para ese tipo no se le ofrece', async () => {
    // Es el caso real de las motos: quedaron sin precio tras la migración.
    await expect(cotizar({ idTipoServicio: 10, idTipoVehiculo: 1, db: dbFalso({ tarifa: null }) }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('no está disponible') });
  });

  test('una tarifa desactivada tampoco sirve', async () => {
    await expect(cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1,
      db: dbFalso({ tarifa: { precio: 10, duracion_min: 60, activo: false, tipoVehiculo: TIPO_LIVIANO } })
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('si el tipo de vehículo está desactivado, tampoco', async () => {
    await expect(cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1,
      db: dbFalso({ tarifa: { precio: 10, duracion_min: 60, activo: true, tipoVehiculo: { ...TIPO_LIVIANO, activo: false } } })
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('pedir un adicional inexistente o desactivado corta la cotización', async () => {
    // No se cotiza "lo que sí existe" por lo bajo: el cliente eligió otra cosa.
    await expect(cotizar({
      idTipoServicio: 10, idTipoVehiculo: 1, adicionales: [1, 99],
      db: dbFalso({ adicionales: [ENCERADO] })
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('adicionales') });
  });

  test('un id de adicional que no es número se rechaza', async () => {
    await expect(cotizar({ idTipoServicio: 10, idTipoVehiculo: 1, adicionales: ['abc'], db: dbFalso() }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(cotizar({ idTipoServicio: 10, idTipoVehiculo: 1, adicionales: [0], db: dbFalso() }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('adicionales tiene que ser una lista', async () => {
    await expect(cotizar({ idTipoServicio: 10, idTipoVehiculo: 1, adicionales: 'encerado', db: dbFalso() }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
