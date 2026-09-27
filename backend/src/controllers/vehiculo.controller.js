/**
 * Controlador de Vehículos - Total Clean Car
 *
 * El tipo de vehículo (moto, liviano, SUV...) es obligatorio al registrar: de él
 * dependen los servicios que se pueden contratar y su precio. Los vehículos
 * anteriores al catálogo quedaron sin tipo; su dueño o el operador lo completan
 * antes de reservar.
 */

const prisma = require('../db');

const incluir = {
  cliente: { select: { id: true, nombre: true } },
  tipoVehiculo: { select: { id: true, codigo: true, nombre: true } }
};

// Valida que el tipo exista y esté activo. Devuelve el id o lanza 400.
const validarTipo = async (id_tipo_vehiculo) => {
  const id = parseInt(id_tipo_vehiculo);
  const tipo = Number.isInteger(id) ? await prisma.tipoVehiculo.findUnique({ where: { id } }) : null;
  if (!tipo || !tipo.activo) {
    throw Object.assign(new Error('Seleccione un tipo de vehículo válido'), { statusCode: 400 });
  }
  return id;
};

const listar = async (req, res) => {
  try {
    const { id_cliente, estado } = req.query;
    const where = {};
    if (id_cliente) where.id_cliente = parseInt(id_cliente);
    if (estado) where.estado = estado;

    // Un cliente solo ve sus propios vehículos, y solo los activos
    if (req.usuario.rol === 'cliente') {
      where.id_cliente = req.usuario.id_cliente;
      where.estado = 'activo';
    }

    const vehiculos = await prisma.vehiculo.findMany({
      where,
      include: incluir,
      orderBy: { placa: 'asc' }
    });
    res.json({ success: true, data: vehiculos });
  } catch (error) {
    console.error('Error listando vehículos:', error);
    res.status(500).json({ success: false, message: 'Error al listar vehículos' });
  }
};

const crear = async (req, res) => {
  try {
    let { id_cliente, placa, marca, modelo, color, id_tipo_vehiculo } = req.body;
    if (req.usuario.rol === 'cliente') id_cliente = req.usuario.id_cliente;

    if (!id_cliente || !placa?.trim()) {
      return res.status(400).json({ success: false, message: 'Cliente y placa son obligatorios' });
    }
    if (!id_tipo_vehiculo) {
      return res.status(400).json({ success: false, message: 'Indique el tipo de vehículo (moto, liviano, SUV...)' });
    }
    const idTipo = await validarTipo(id_tipo_vehiculo);

    const existe = await prisma.vehiculo.findUnique({ where: { placa: placa.toUpperCase().trim() } });
    if (existe) return res.status(409).json({ success: false, message: 'Ya existe un vehículo con esa placa' });

    const vehiculo = await prisma.vehiculo.create({
      data: {
        id_cliente: parseInt(id_cliente),
        placa: placa.toUpperCase().trim(),
        marca: marca?.trim() || null,
        modelo: modelo?.trim() || null,
        color: color?.trim() || null,
        id_tipo_vehiculo: idTipo
      },
      include: incluir
    });
    res.status(201).json({ success: true, data: vehiculo });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('Error creando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al crear vehículo' });
  }
};

// Interno: todo. Cliente: solo sus vehículos, y sin poder cambiar el estado.
const actualizar = async (req, res) => {
  try {
    const { marca, modelo, color, id_tipo_vehiculo, estado } = req.body;
    const actual = await prisma.vehiculo.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!actual) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });

    const esCliente = req.usuario.rol === 'cliente';
    if (esCliente && actual.id_cliente !== req.usuario.id_cliente) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }

    const vehiculo = await prisma.vehiculo.update({
      where: { id: actual.id },
      data: {
        ...(marca !== undefined && { marca: marca?.trim() || null }),
        ...(modelo !== undefined && { modelo: modelo?.trim() || null }),
        ...(color !== undefined && { color: color?.trim() || null }),
        ...(id_tipo_vehiculo !== undefined && { id_tipo_vehiculo: await validarTipo(id_tipo_vehiculo) }),
        ...(!esCliente && estado && { estado })
      },
      include: incluir
    });
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar vehículo' });
  }
};

const eliminar = async (req, res) => {
  try {
    await prisma.vehiculo.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'inactivo' }
    });
    res.json({ success: true, message: 'Vehículo desactivado' });
  } catch (error) {
    console.error('Error eliminando vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar vehículo' });
  }
};

module.exports = { listar, crear, actualizar, eliminar };
