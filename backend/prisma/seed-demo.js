/**
 * Seed de datos ficticios para demo - Sistema de Lavado de Carros
 * Crea 5 clientes con vehículos y reservas repartidas en ayer / hoy / mañana,
 * en distintos estados (completada, en_proceso, confirmada, solicitada, no_asistio),
 * para que la agenda, "mis trabajos" y los reportes tengan datos con los que trabajar.
 *
 * Uso: node prisma/seed-demo.js   (requiere que ya haya corrido prisma/seed.js)
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const diaEn = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const sumarMin = (hhmm, min) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

let contadorCodigo = null;
const siguienteCodigo = async () => {
  const anio = new Date().getFullYear();
  if (contadorCodigo === null) {
    const ultima = await prisma.reserva.findFirst({
      where: { codigo: { startsWith: `RES-${anio}-` } },
      orderBy: { codigo: 'desc' }
    });
    contadorCodigo = ultima ? parseInt(ultima.codigo.split('-')[2]) : 0;
  }
  contadorCodigo += 1;
  return `RES-${anio}-${String(contadorCodigo).padStart(5, '0')}`;
};

async function crearCliente({ nombre, email, telefono, password, vehiculos }) {
  let cliente = await prisma.cliente.findUnique({ where: { email } });
  if (!cliente) {
    cliente = await prisma.cliente.create({ data: { nombre, email, telefono } });
  }
  await prisma.usuario.upsert({
    where: { username: email },
    update: { id_cliente: cliente.id },
    create: { username: email, password: await bcrypt.hash(password, 10), rol: 'cliente', id_cliente: cliente.id }
  });

  const vehiculosCreados = [];
  for (const v of vehiculos) {
    const existente = await prisma.vehiculo.findUnique({ where: { placa: v.placa } });
    const vehiculo = existente || await prisma.vehiculo.create({ data: { ...v, id_cliente: cliente.id } });
    vehiculosCreados.push(vehiculo);
  }
  return { cliente, vehiculos: vehiculosCreados };
}

async function crearReserva({ cliente, vehiculo, servicio, estacionamiento, dia, hora_inicio, id_lavador, estado }) {
  const hora_fin = sumarMin(hora_inicio, servicio.duracion_min);

  const reserva = await prisma.reserva.create({
    data: {
      codigo: await siguienteCodigo(),
      id_cliente: cliente.id,
      id_vehiculo: vehiculo.id,
      id_tipo_servicio: servicio.id,
      id_estacionamiento: estacionamiento ? estacionamiento.id : null,
      modalidad: servicio.modalidad,
      fecha: dia,
      hora_inicio,
      hora_fin,
      estado,
      precio_final: servicio.precio
    }
  });

  const estadoAsignacion = estado === 'completada' ? 'completado'
    : estado === 'en_proceso' ? 'en_proceso'
    : (estado === 'cancelada' || estado === 'no_asistio') ? 'cancelado'
    : 'pendiente';

  await prisma.asignacionAgenda.create({
    data: {
      id_reserva: reserva.id,
      id_lavador: id_lavador || null,
      fecha: dia,
      hora_inicio,
      hora_fin,
      estado: estadoAsignacion
    }
  });

  await prisma.historialReserva.create({
    data: { id_reserva: reserva.id, accion: 'creacion', estado_nuevo: 'solicitada', usuario: 'seed-demo' }
  });
  if (estado !== 'solicitada') {
    await prisma.historialReserva.create({
      data: { id_reserva: reserva.id, accion: 'cambio_estado', estado_anterior: 'solicitada', estado_nuevo: estado, usuario: 'seed-demo' }
    });
  }

  if (estado === 'completada') {
    await prisma.pago.create({
      data: { id_reserva: reserva.id, monto: servicio.precio, metodo: 'efectivo', estado: 'aprobado', fecha_pago: dia }
    });
    await prisma.registroLavado.create({
      data: {
        id_reserva: reserva.id,
        checklist: { exterior: true, interior: true, llantas: true },
        observaciones: 'Lavado realizado sin novedad.',
        fecha_fin: dia
      }
    });
    await prisma.calificacion.create({
      data: { id_reserva: reserva.id, id_cliente: cliente.id, puntuacion: 4 + (reserva.id % 2), comentario: 'Buen servicio, puntual.' }
    });
  }

  return reserva;
}

async function main() {
  console.log('🌱 Sembrando datos ficticios de demo...');

  const servicios = await prisma.tipoServicio.findMany();
  const servicio = (nombre) => servicios.find((s) => s.nombre === nombre);

  const sitios = await prisma.estacionamiento.findMany();
  const sitio = (nombre) => sitios.find((e) => e.nombre === nombre);

  const lavadores = await prisma.lavador.findMany();
  const lavador = (nombre) => lavadores.find((l) => l.nombre === nombre);

  const PASSWORD_DEMO = 'cliente123';

  const { cliente: maria, vehiculos: vMaria } = await crearCliente({
    nombre: 'María Fernández', email: 'maria.fernandez@demo.com', telefono: '+593991000001',
    password: PASSWORD_DEMO, vehiculos: [{ placa: 'ABC-101', marca: 'Chevrolet', modelo: 'Sail', color: 'Blanco', tipo: 'sedan' }]
  });
  const { cliente: jorge, vehiculos: vJorge } = await crearCliente({
    nombre: 'Jorge Ramírez', email: 'jorge.ramirez@demo.com', telefono: '+593991000002',
    password: PASSWORD_DEMO, vehiculos: [{ placa: 'XYZ-202', marca: 'Kia', modelo: 'Sportage', color: 'Gris', tipo: 'suv' }]
  });
  const { cliente: sofia, vehiculos: vSofia } = await crearCliente({
    nombre: 'Sofía Castillo', email: 'sofia.castillo@demo.com', telefono: '+593991000003',
    password: PASSWORD_DEMO, vehiculos: [{ placa: 'DEF-303', marca: 'Toyota', modelo: 'Hilux', color: 'Negro', tipo: 'camioneta' }]
  });
  const { cliente: andres, vehiculos: vAndres } = await crearCliente({
    nombre: 'Andrés Molina', email: 'andres.molina@demo.com', telefono: '+593991000004',
    password: PASSWORD_DEMO,
    vehiculos: [
      { placa: 'GHI-404', marca: 'Hyundai', modelo: 'Accent', color: 'Rojo', tipo: 'sedan' },
      { placa: 'JKL-505', marca: 'Honda', modelo: 'CB190', color: 'Negro', tipo: 'moto' }
    ]
  });
  const { cliente: valentina, vehiculos: vValentina } = await crearCliente({
    nombre: 'Valentina Ríos', email: 'valentina.rios@demo.com', telefono: '+593991000005',
    password: PASSWORD_DEMO, vehiculos: [{ placa: 'MNO-606', marca: 'Mazda', modelo: 'CX-5', color: 'Azul', tipo: 'suv' }]
  });

  console.log('✅ 5 clientes ficticios + vehículos creados');

  const ayer = diaEn(-1);
  const hoy = diaEn(0);
  const manana = diaEn(1);

  // ==================== AYER (completadas / no-show) ====================
  await crearReserva({ cliente: maria, vehiculo: vMaria[0], servicio: servicio('Expreso Completo'), estacionamiento: sitio('Edificio Central Park'), dia: ayer, hora_inicio: '09:00', id_lavador: lavador('Carlos Pérez').id, estado: 'completada' });
  await crearReserva({ cliente: jorge, vehiculo: vJorge[0], servicio: servicio('Expreso Exterior'), estacionamiento: sitio('Condominio Los Alamos'), dia: ayer, hora_inicio: '10:00', id_lavador: lavador('Luis Gómez').id, estado: 'completada' });
  await crearReserva({ cliente: sofia, vehiculo: vSofia[0], servicio: servicio('Limpieza Profunda'), estacionamiento: null, dia: ayer, hora_inicio: '11:00', id_lavador: null, estado: 'completada' });
  await crearReserva({ cliente: andres, vehiculo: vAndres[0], servicio: servicio('Expreso Premium'), estacionamiento: sitio('Torre Empresarial Norte'), dia: ayer, hora_inicio: '14:00', id_lavador: lavador('Ana Torres').id, estado: 'no_asistio' });

  // ==================== HOY (en curso / confirmadas / pendientes) ====================
  await crearReserva({ cliente: valentina, vehiculo: vValentina[0], servicio: servicio('Expreso Interior'), estacionamiento: sitio('Edificio Central Park'), dia: hoy, hora_inicio: '09:00', id_lavador: lavador('Ana Torres').id, estado: 'en_proceso' });
  await crearReserva({ cliente: maria, vehiculo: vMaria[0], servicio: servicio('Expreso Motor y Llantas'), estacionamiento: sitio('Condominio Los Alamos'), dia: hoy, hora_inicio: '11:00', id_lavador: lavador('Carlos Pérez').id, estado: 'confirmada' });
  await crearReserva({ cliente: jorge, vehiculo: vJorge[0], servicio: servicio('Limpieza Profunda'), estacionamiento: null, dia: hoy, hora_inicio: '15:00', id_lavador: null, estado: 'confirmada' });
  await crearReserva({ cliente: andres, vehiculo: vAndres[1], servicio: servicio('Expreso Completo'), estacionamiento: sitio('Torre Empresarial Norte'), dia: hoy, hora_inicio: '16:00', id_lavador: null, estado: 'solicitada' });

  // ==================== MAÑANA (agenda futura) ====================
  await crearReserva({ cliente: sofia, vehiculo: vSofia[0], servicio: servicio('Expreso Exterior'), estacionamiento: sitio('Edificio Central Park'), dia: manana, hora_inicio: '08:00', id_lavador: null, estado: 'solicitada' });
  await crearReserva({ cliente: valentina, vehiculo: vValentina[0], servicio: servicio('Expreso Premium'), estacionamiento: sitio('Condominio Los Alamos'), dia: manana, hora_inicio: '10:00', id_lavador: lavador('Luis Gómez').id, estado: 'confirmada' });
  await crearReserva({ cliente: andres, vehiculo: vAndres[0], servicio: servicio('Limpieza Profunda'), estacionamiento: null, dia: manana, hora_inicio: '13:00', id_lavador: null, estado: 'solicitada' });
  await crearReserva({ cliente: maria, vehiculo: vMaria[0], servicio: servicio('Expreso Interior'), estacionamiento: sitio('Torre Empresarial Norte'), dia: manana, hora_inicio: '15:00', id_lavador: lavador('Carlos Pérez').id, estado: 'confirmada' });

  console.log('✅ 12 reservas ficticias creadas (4 ayer, 4 hoy, 4 mañana)');
  console.log(`\n🎉 Seed de demo completado. Contraseña de todos los clientes ficticios: ${PASSWORD_DEMO}`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed-demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
