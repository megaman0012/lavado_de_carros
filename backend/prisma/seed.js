/**
 * Seed inicial - Sistema de Lavado de Carros
 * Crea: admin/operador/lavador, catálogo de servicios (5 expresos + profunda),
 * estacionamientos demo con bahías y lavadores.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed del sistema de lavado de carros...');

  // ==================== USUARIOS ====================
  const passAdmin = await bcrypt.hash('admin123', 10);
  const passOperador = await bcrypt.hash('operador123', 10);
  const passLavador = await bcrypt.hash('lavador123', 10);

  const admin = await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: passAdmin, rol: 'admin' }
  });

  await prisma.usuario.upsert({
    where: { username: 'operador' },
    update: {},
    create: { username: 'operador', password: passOperador, rol: 'operador' }
  });

  console.log('✅ Usuarios base creados (admin/admin123, operador/operador123)');

  // ==================== LAVADORES ====================
  const nombresLavadores = ['Carlos Pérez', 'Luis Gómez', 'Ana Torres'];
  const lavadores = [];
  for (let i = 0; i < nombresLavadores.length; i++) {
    const username = `lavador${i + 1}`;
    let lavador = await prisma.lavador.findFirst({ where: { nombre: nombresLavadores[i] } });
    if (!lavador) {
      lavador = await prisma.lavador.create({
        data: { nombre: nombresLavadores[i], telefono: `+59399${String(100000 + i)}` }
      });
    }
    await prisma.usuario.upsert({
      where: { username },
      update: { id_lavador: lavador.id },
      create: { username, password: passLavador, rol: 'lavador', id_lavador: lavador.id }
    });
    lavadores.push(lavador);
  }
  console.log(`✅ ${lavadores.length} lavadores creados`);

  // ==================== TIPOS DE VEHÍCULO ====================
  const tiposVehiculo = [
    { codigo: 'moto', nombre: 'Moto', descripcion: 'Motocicletas y scooters', orden_display: 1 },
    { codigo: 'liviano', nombre: 'Liviano', descripcion: 'Sedán, hatchback y autos compactos', orden_display: 2 },
    { codigo: 'suv', nombre: 'SUV', descripcion: 'SUV y crossover', orden_display: 3 },
    { codigo: 'camioneta', nombre: 'Camioneta', descripcion: 'Pickup, camioneta doble cabina y van', orden_display: 4 }
  ];
  const tipos = {};
  for (const t of tiposVehiculo) {
    tipos[t.codigo] = await prisma.tipoVehiculo.upsert({ where: { codigo: t.codigo }, update: {}, create: t });
  }
  console.log(`✅ ${tiposVehiculo.length} tipos de vehículo`);

  // ==================== CATÁLOGO DE SERVICIOS ====================
  // Precio y duración por tipo de vehículo: [precio, minutos]. Sin entrada para
  // un tipo = el servicio no se ofrece a ese tipo. Valores de ejemplo.
  const servicios = [
    { nombre: 'Expreso Exterior', descripcion: 'Lavado exterior a presión + secado', modalidad: 'expreso', orden_display: 1,
      precios: { moto: [5, 20], liviano: [8, 30], suv: [10, 40], camioneta: [12, 45] } },
    { nombre: 'Expreso Interior', descripcion: 'Aspirado + limpieza de tablero y plásticos', modalidad: 'expreso', orden_display: 2,
      precios: { liviano: [10, 40], suv: [12, 50], camioneta: [13, 50] } },
    { nombre: 'Expreso Completo', descripcion: 'Exterior + interior', modalidad: 'expreso', orden_display: 3,
      precios: { moto: [8, 30], liviano: [15, 60], suv: [18, 75], camioneta: [20, 80] } },
    { nombre: 'Expreso Premium', descripcion: 'Completo + encerado y abrillantado', modalidad: 'expreso', orden_display: 4,
      precios: { liviano: [22, 90], suv: [26, 105], camioneta: [28, 110] } },
    { nombre: 'Expreso Motor y Llantas', descripcion: 'Limpieza de motor, llantas y neumáticos', modalidad: 'expreso', orden_display: 5,
      precios: { moto: [7, 30], liviano: [12, 45], suv: [14, 50], camioneta: [15, 55] } },
    { nombre: 'Limpieza Profunda', descripcion: 'Shampoo de tapiz, desmanchado, pulido y detalle integral en bahía', modalidad: 'profunda', orden_display: 6,
      precios: { liviano: [55, 180], suv: [65, 210], camioneta: [70, 220] } }
  ];
  for (const { precios, ...s } of servicios) {
    const servicio = await prisma.tipoServicio.findFirst({ where: { nombre: s.nombre } }) || await prisma.tipoServicio.create({ data: s });
    for (const [codigo, [precio, duracion_min]] of Object.entries(precios)) {
      await prisma.precioServicio.upsert({
        where: { id_tipo_servicio_id_tipo_vehiculo: { id_tipo_servicio: servicio.id, id_tipo_vehiculo: tipos[codigo].id } },
        update: {},
        create: { id_tipo_servicio: servicio.id, id_tipo_vehiculo: tipos[codigo].id, precio, duracion_min }
      });
    }
  }
  console.log(`✅ ${servicios.length} tipos de servicio con precios por tipo de vehículo`);

  // ==================== SERVICIOS ADICIONALES ====================
  const adicionales = [
    { nombre: 'Aromatizante', descripcion: 'Aromatizante de cabina de larga duración', precio: 2, duracion_min: 0, orden_display: 1 },
    { nombre: 'Encerado express', descripcion: 'Cera líquida de protección y brillo', precio: 6, duracion_min: 15, orden_display: 2 },
    { nombre: 'Hidratación de plásticos', descripcion: 'Tablero, paneles y molduras', precio: 4, duracion_min: 10, orden_display: 3 },
    { nombre: 'Repelente de agua en vidrios', descripcion: 'Parabrisas y ventanas laterales', precio: 5, duracion_min: 10, orden_display: 4 }
  ];
  for (const a of adicionales) {
    const existe = await prisma.servicioAdicional.findFirst({ where: { nombre: a.nombre } });
    if (!existe) await prisma.servicioAdicional.create({ data: a });
  }
  console.log(`✅ ${adicionales.length} servicios adicionales`);

  // ==================== ESTACIONAMIENTOS DEMO ====================
  const sitios = [
    { nombre: 'Edificio Central Park', direccion: 'Av. Principal 123', ciudad: 'Quito' },
    { nombre: 'Condominio Los Alamos', direccion: 'Calle 5 y Av. 10', ciudad: 'Quito' },
    { nombre: 'Torre Empresarial Norte', direccion: 'Av. Amazonas N36-152', ciudad: 'Quito' }
  ];
  for (const sitio of sitios) {
    const existe = await prisma.estacionamiento.findFirst({ where: { nombre: sitio.nombre } });
    if (!existe) {
      const est = await prisma.estacionamiento.create({ data: sitio });
      // Plazas de estacionamiento
      for (let p = 1; p <= 10; p++) {
        await prisma.plaza.create({
          data: {
            id_estacionamiento: est.id,
            codigo: `P-${String(p).padStart(2, '0')}`,
            tipo: 'estacionamiento'
          }
        });
      }
    }
  }

  // Bahías de lavado (para limpieza profunda)
  const bahiasExistentes = await prisma.plaza.count({ where: { tipo: 'bahia_lavado' } });
  if (bahiasExistentes === 0) {
    const taller = await prisma.estacionamiento.create({
      data: {
        nombre: 'Taller Central - Bahías',
        direccion: 'Av. Industrial 45',
        ciudad: 'Quito',
        admite_expreso: false
      }
    });
    for (let b = 1; b <= 2; b++) {
      await prisma.plaza.create({
        data: {
          id_estacionamiento: taller.id,
          codigo: `B-${String(b).padStart(2, '0')}`,
          tipo: 'bahia_lavado'
        }
      });
    }
  }
  console.log('✅ Estacionamientos demo + 2 bahías de lavado creados');

  console.log('\n🎉 Seed completado.');
  console.log('   Login: admin/admin123 · operador/operador123 · lavador1/lavador123');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
