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

  // ==================== CATÁLOGO DE SERVICIOS ====================
  const servicios = [
    { nombre: 'Expreso Exterior', descripcion: 'Lavado exterior a presión + secado', modalidad: 'expreso', duracion_min: 30, precio: 8, orden_display: 1 },
    { nombre: 'Expreso Interior', descripcion: 'Aspirado + limpieza de tablero y plásticos', modalidad: 'expreso', duracion_min: 40, precio: 10, orden_display: 2 },
    { nombre: 'Expreso Completo', descripcion: 'Exterior + interior', modalidad: 'expreso', duracion_min: 60, precio: 15, orden_display: 3 },
    { nombre: 'Expreso Premium', descripcion: 'Completo + encerado y abrillantado', modalidad: 'expreso', duracion_min: 90, precio: 22, orden_display: 4 },
    { nombre: 'Expreso Motor y Llantas', descripcion: 'Limpieza de motor, llantas y neumáticos', modalidad: 'expreso', duracion_min: 45, precio: 12, orden_display: 5 },
    { nombre: 'Limpieza Profunda', descripcion: 'Shampoo de tapiz, desmanchado, pulido y detalle integral en bahía', modalidad: 'profunda', duracion_min: 180, precio: 55, orden_display: 6 }
  ];
  for (const s of servicios) {
    const existe = await prisma.tipoServicio.findFirst({ where: { nombre: s.nombre } });
    if (!existe) await prisma.tipoServicio.create({ data: s });
  }
  console.log(`✅ ${servicios.length} tipos de servicio creados`);

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
