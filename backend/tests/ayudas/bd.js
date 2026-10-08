/**
 * Base de datos de pruebas: limpieza y datos de arranque.
 *
 * Cada archivo de integración llama a `sembrar()` en su beforeEach para empezar
 * de un estado conocido. Es más lento que compartir datos entre pruebas, pero
 * evita el peor tipo de prueba: la que pasa o falla según el orden en que corre.
 */

const bcrypt = require('bcryptjs');

// Hay base de pruebas solo si tests/entorno.js encontró DATABASE_URL_TEST.
const hayBD = Boolean(process.env.DATABASE_URL);

// Red de seguridad por si alguien exporta DATABASE_URL_TEST apuntando a la base
// real: `limpiar()` vacía tablas, y eso sobre producción no tiene vuelta atrás.
if (hayBD) {
  const nombre = (process.env.DATABASE_URL.split('/').pop() || '').split('?')[0];
  if (!/test/i.test(nombre)) {
    throw new Error(
      `DATABASE_URL_TEST apunta a la base "${nombre}". Las pruebas vacían tablas: ` +
      'use una base dedicada cuyo nombre contenga "test" (por ejemplo lavado_test).'
    );
  }
}

const prisma = hayBD ? require('../../src/db') : null;

// La lista de tablas no cambia entre pruebas: se arma una sola vez por proceso.
let limpieza = null;

/**
 * Deja la base vacía y con los contadores de id en 1.
 *
 * Se usa DELETE y no TRUNCATE porque con un beforeEach por prueba la diferencia
 * se nota: sobre tablas de pocas filas, TRUNCATE tarda ~1,4 s (reescribe los
 * archivos de las 20 tablas) y estos DELETE, ~40 ms. `session_replication_role
 * = replica` apaga las claves foráneas mientras dura la transacción del bloque,
 * así no hace falta borrar en el orden de las dependencias; `SET LOCAL` las
 * devuelve a su lugar al terminar.
 *
 * Esa variable exige ser superusuario. Lo somos tanto en el Postgres de
 * desarrollo como en el servicio de la CI, pero si algún día no lo fuéramos, el
 * respaldo es TRUNCATE: más lento, mismo resultado.
 */
const limpiar = async () => {
  if (!limpieza) {
    const tablas = (await prisma.$queryRaw`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `).map((t) => t.tablename);

    limpieza = {
      rapida: `DO $$ BEGIN
  SET LOCAL session_replication_role = replica;
${tablas.map((t) => `  DELETE FROM "public"."${t}";`).join('\n')}
${tablas.map((t) => `  ALTER SEQUENCE IF EXISTS "public"."${t}_id_seq" RESTART WITH 1;`).join('\n')}
END $$;`,
      respaldo: tablas.length
        ? `TRUNCATE TABLE ${tablas.map((t) => `"public"."${t}"`).join(', ')} RESTART IDENTITY CASCADE`
        : null
    };
  }
  if (!limpieza.respaldo) return;

  try {
    await prisma.$executeRawUnsafe(limpieza.rapida);
  } catch (e) {
    await prisma.$executeRawUnsafe(limpieza.respaldo);
  }
};

const CLAVE = 'prueba1234';

/**
 * Datos mínimos para ejercitar el negocio completo:
 *   - tipos liviano y moto; la moto NO tiene precio para el servicio expreso,
 *     que es justamente el caso "este servicio no se ofrece a este tipo";
 *   - un sitio con capacidad 1 (ahí se prueba el doble-reserva) y otro con 2;
 *   - una sola bahía de lavado, que es la capacidad de la modalidad profunda;
 *   - un usuario por rol, todos con la misma contraseña.
 */
const sembrar = async () => {
  await limpiar();
  const password = await bcrypt.hash(CLAVE, 4); // coste bajo: son pruebas, no producción

  // Los creates que no dependen entre sí van juntos: con un beforeEach por
  // prueba, cada viaje de ida y vuelta a la base se paga decenas de veces.
  const [liviano, moto, expreso, profunda] = await Promise.all([
    prisma.tipoVehiculo.create({ data: { codigo: 'liviano', nombre: 'Liviano', orden_display: 1 } }),
    prisma.tipoVehiculo.create({ data: { codigo: 'moto', nombre: 'Moto', orden_display: 2 } }),
    prisma.tipoServicio.create({ data: { nombre: 'Lavado expreso', modalidad: 'expreso', orden_display: 1 } }),
    prisma.tipoServicio.create({ data: { nombre: 'Lavado profundo', modalidad: 'profunda', orden_display: 2 } })
  ]);

  const precios = prisma.precioServicio.createMany({
    data: [
      { id_tipo_servicio: expreso.id, id_tipo_vehiculo: liviano.id, precio: 10, duracion_min: 60 },
      { id_tipo_servicio: profunda.id, id_tipo_vehiculo: liviano.id, precio: 25, duracion_min: 120 },
      // La moto solo tiene tarifa de lavado profundo: pedir el expreso para una
      // moto tiene que ser rechazado.
      { id_tipo_servicio: profunda.id, id_tipo_vehiculo: moto.id, precio: 15, duracion_min: 60 }
    ]
  });

  const [encerado, sitio, sitioAmplio] = await Promise.all([
    prisma.servicioAdicional.create({ data: { nombre: 'Encerado', precio: 5, duracion_min: 30, orden_display: 1 } }),
    // capacidad_expreso = 1 → el segundo que pida la misma franja se queda afuera
    prisma.estacionamiento.create({
      data: { nombre: 'Edificio Central', ciudad: 'Guayaquil', capacidad_expreso: 1, duracion_franja_min: 60 }
    }),
    prisma.estacionamiento.create({
      data: { nombre: 'Torre Norte', ciudad: 'Guayaquil', capacidad_expreso: 2, duracion_franja_min: 60 }
    }),
    precios
  ]);
  const [lavador, ana, beto] = await Promise.all([
    prisma.lavador.create({ data: { nombre: 'Luis Lavador', cedula: '0900000001' } }),
    prisma.cliente.create({
      data: { nombre: 'Ana Vera', cedula: '0910000001', telefono: '0999999999', email: 'ana@prueba.local' }
    }),
    prisma.cliente.create({
      data: { nombre: 'Beto Ruiz', cedula: '0910000002', email: 'beto@prueba.local' }
    }),
    prisma.plaza.create({
      // Una sola bahía: es la capacidad de la modalidad profunda, que es global.
      data: { id_estacionamiento: sitio.id, codigo: 'B-01', tipo: 'bahia_lavado', estado: 'disponible' }
    })
  ]);

  const [autoDeAna, motoDeAna, autoDeBeto] = await Promise.all([
    prisma.vehiculo.create({
      data: { id_cliente: ana.id, placa: 'ABC-1234', marca: 'Chevrolet', modelo: 'Sail', color: 'Blanco', id_tipo_vehiculo: liviano.id }
    }),
    prisma.vehiculo.create({
      data: { id_cliente: ana.id, placa: 'MOT-0001', marca: 'Yamaha', id_tipo_vehiculo: moto.id }
    }),
    prisma.vehiculo.create({
      data: { id_cliente: beto.id, placa: 'XYZ-9876', marca: 'Kia', modelo: 'Rio', id_tipo_vehiculo: liviano.id }
    }),
    prisma.usuario.create({ data: { username: 'luis', password, rol: 'lavador', id_lavador: lavador.id } }),
    prisma.usuario.create({ data: { username: 'admin', password, rol: 'admin' } }),
    prisma.usuario.create({ data: { username: 'operador', password, rol: 'operador' } }),
    prisma.usuario.create({ data: { username: 'ana@prueba.local', password, rol: 'cliente', id_cliente: ana.id } }),
    prisma.usuario.create({ data: { username: 'beto@prueba.local', password, rol: 'cliente', id_cliente: beto.id } })
  ]);

  return {
    CLAVE,
    tipos: { liviano, moto },
    servicios: { expreso, profunda },
    adicionales: { encerado },
    sitio,
    sitioAmplio,
    lavador,
    clientes: { ana, beto },
    vehiculos: { autoDeAna, motoDeAna, autoDeBeto }
  };
};

/** Cierra la conexión; se llama en el afterAll de cada archivo. */
const desconectar = () => (prisma ? prisma.$disconnect() : Promise.resolve());

module.exports = { hayBD, prisma, limpiar, sembrar, desconectar, CLAVE };
