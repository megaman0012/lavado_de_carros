/**
 * Controlador de Clientes - Total Clean Car
 */

const prisma = require('../db');
const sesionService = require('../services/sesion.service');
const { generarPasswordTemporal, hashear } = require('../utils/credenciales');

const TIPOS = ['persona', 'empresa'];

/**
 * Datos de empresa del cuerpo de la petición, validados. Una empresa necesita
 * RUC (13 dígitos, como lo emite el SRI) porque es a quien se le factura.
 * Devuelve { datos } o { error }.
 */
const datosEmpresa = (body, tipoFinal) => {
  if (tipoFinal !== 'empresa') {
    return { datos: { ruc: null, razon_social: null, email_facturacion: null, direccion_fiscal: null } };
  }
  const ruc = body.ruc?.toString().replace(/\s/g, '') || '';
  if (!/^\d{13}$/.test(ruc)) return { error: 'El RUC de la empresa debe tener 13 dígitos' };
  return {
    datos: {
      ruc,
      razon_social: body.razon_social?.trim() || null,
      email_facturacion: body.email_facturacion?.trim().toLowerCase() || null,
      direccion_fiscal: body.direccion_fiscal?.trim() || null
    }
  };
};

// Vehículos del cliente tal como los muestra el panel: con el tipo resuelto
// (de él dependen los precios) y ordenados por placa. Se devuelven también los
// dados de baja —con su `estado`— porque el panel los marca en vez de ocultarlos:
// un vehículo inactivo sigue apareciendo en las reservas históricas.
const incluirVehiculos = {
  include: { tipoVehiculo: { select: { id: true, codigo: true, nombre: true } } },
  orderBy: { placa: 'asc' }
};

const listar = async (req, res) => {
  try {
    const { estado, busqueda, tipo } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (tipo && TIPOS.includes(tipo)) where.tipo = tipo;
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { email: { contains: busqueda, mode: 'insensitive' } },
        { cedula: { contains: busqueda } },
        { ruc: { contains: busqueda } },
        { razon_social: { contains: busqueda, mode: 'insensitive' } }
      ];
    }
    const clientes = await prisma.cliente.findMany({
      where,
      include: { vehiculos: incluirVehiculos, usuario: { select: { id: true, username: true, rol: true } } },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: clientes });
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ success: false, message: 'Error al listar clientes' });
  }
};

const obtener = async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { vehiculos: incluirVehiculos, reservas: true, usuario: { select: { id: true, username: true } } }
    });
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ success: false, message: 'Error al obtener cliente' });
  }
};

// Alta de cliente desde el panel (cliente atendido en sitio o por teléfono).
// Con crear_acceso=true se le genera además la cuenta para que después pueda
// entrar al sitio y ver su historial; sin eso queda como ficha sin login.
const crear = async (req, res) => {
  try {
    const { nombre, cedula, telefono, email, crear_acceso } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const tipo = req.body.tipo || 'persona';
    if (!TIPOS.includes(tipo)) return res.status(400).json({ success: false, message: 'Tipo inválido (persona | empresa)' });
    const empresa = datosEmpresa(req.body, tipo);
    if (empresa.error) return res.status(400).json({ success: false, message: empresa.error });
    if (empresa.datos.ruc && await prisma.cliente.findUnique({ where: { ruc: empresa.datos.ruc } })) {
      return res.status(409).json({ success: false, message: 'Ya existe una empresa con ese RUC' });
    }

    const emailNormalizado = email?.trim().toLowerCase() || null;
    const conAcceso = crear_acceso === true || crear_acceso === 'true';

    if (conAcceso && !emailNormalizado) {
      return res.status(400).json({ success: false, message: 'Para crear el acceso hace falta un email (es el usuario de ingreso)' });
    }
    if (emailNormalizado) {
      const clienteExistente = await prisma.cliente.findUnique({ where: { email: emailNormalizado } });
      if (clienteExistente) {
        return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese email' });
      }
      if (conAcceso) {
        const usuarioExistente = await prisma.usuario.findUnique({ where: { username: emailNormalizado } });
        if (usuarioExistente) {
          return res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese email' });
        }
      }
    }

    const passwordTemporal = conAcceso ? generarPasswordTemporal() : null;

    const cliente = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.cliente.create({
        data: {
          tipo,
          nombre: nombre.trim(),
          cedula: tipo === 'empresa' ? null : cedula?.trim() || null,
          telefono: telefono?.trim() || null,
          email: emailNormalizado,
          ...empresa.datos
        }
      });
      if (conAcceso) {
        await tx.usuario.create({
          data: {
            username: emailNormalizado,
            password: await hashear(passwordTemporal),
            rol: 'cliente',
            id_cliente: nuevo.id
          }
        });
      }
      return nuevo;
    });

    // password_temporal viaja solo en esta respuesta; no se puede volver a consultar
    res.status(201).json({ success: true, data: { ...cliente, password_temporal: passwordTemporal } });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al crear cliente' });
  }
};

// Crea el acceso de un cliente que no lo tenía, o restablece su contraseña.
// Devuelve la contraseña provisional una sola vez.
const generarAcceso = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cliente = await prisma.cliente.findUnique({ where: { id }, include: { usuario: true } });
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    if (!cliente.email) {
      return res.status(400).json({ success: false, message: 'El cliente necesita un email para poder ingresar' });
    }

    const passwordTemporal = generarPasswordTemporal();
    const password = await hashear(passwordTemporal);

    if (cliente.usuario) {
      await prisma.usuario.update({
        where: { id: cliente.usuario.id },
        data: { password, username: cliente.email, estado: 'activo' }
      });
      // La contraseña anterior deja de servir, y las sesiones que la usaron también:
      // sin esto, un refresh token viejo seguiría renovando el acceso durante días.
      await sesionService.revocarUsuario(cliente.usuario.id);
    } else {
      const ocupado = await prisma.usuario.findUnique({ where: { username: cliente.email } });
      if (ocupado) {
        return res.status(409).json({ success: false, message: 'Ya existe otra cuenta con ese email' });
      }
      await prisma.usuario.create({
        data: { username: cliente.email, password, rol: 'cliente', id_cliente: cliente.id }
      });
    }

    res.json({
      success: true,
      data: { username: cliente.email, password_temporal: passwordTemporal },
      message: cliente.usuario ? 'Contraseña restablecida' : 'Acceso creado'
    });
  } catch (error) {
    console.error('Error generando acceso del cliente:', error);
    res.status(500).json({ success: false, message: 'Error al generar el acceso' });
  }
};

// Al editar hay que mantener el Usuario en sincronía: el username ES el email,
// y suspender al cliente debe cerrarle el acceso (antes solo se marcaba la ficha
// y la persona seguía entrando igual).
const actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, cedula, telefono, email, estado } = req.body;

    const actual = await prisma.cliente.findUnique({ where: { id }, include: { usuario: true } });
    if (!actual) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    // Tipo y datos de empresa: solo se tocan si vienen en la petición
    const tipoFinal = req.body.tipo || actual.tipo;
    if (!TIPOS.includes(tipoFinal)) return res.status(400).json({ success: false, message: 'Tipo inválido (persona | empresa)' });
    const tocaEmpresa = req.body.tipo !== undefined || req.body.ruc !== undefined;
    let empresa = { datos: {} };
    if (tocaEmpresa) {
      empresa = datosEmpresa({ ...actual, ...req.body }, tipoFinal);
      if (empresa.error) return res.status(400).json({ success: false, message: empresa.error });
      if (empresa.datos.ruc) {
        const otra = await prisma.cliente.findUnique({ where: { ruc: empresa.datos.ruc } });
        if (otra && otra.id !== id) return res.status(409).json({ success: false, message: 'Ya existe una empresa con ese RUC' });
      }
    }
    // Una empresa que deja de serlo no puede dejar lavados a crédito sin cortar
    if (actual.tipo === 'empresa' && tipoFinal === 'persona') {
      const sinCortar = await prisma.reserva.count({
        where: { id_cliente: id, forma_cobro: 'credito', id_corte: null, estado: { notIn: ['cancelada', 'no_asistio'] } }
      });
      if (sinCortar > 0) {
        return res.status(400).json({
          success: false,
          message: `Tiene ${sinCortar} lavado(s) a crédito sin incluir en un corte: ciérrelos antes de cambiarla a persona`
        });
      }
    }

    if (estado && !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido (activo | inactivo)' });
    }

    const emailNormalizado = email !== undefined ? (email?.trim().toLowerCase() || null) : undefined;
    if (emailNormalizado) {
      const otro = await prisma.cliente.findUnique({ where: { email: emailNormalizado } });
      if (otro && otro.id !== id) {
        return res.status(409).json({ success: false, message: 'Ya existe otro cliente con ese email' });
      }
      const otraCuenta = await prisma.usuario.findUnique({ where: { username: emailNormalizado } });
      if (otraCuenta && otraCuenta.id_cliente !== id) {
        return res.status(409).json({ success: false, message: 'Ya existe otra cuenta con ese email' });
      }
    }
    if (emailNormalizado === null && actual.usuario) {
      return res.status(400).json({ success: false, message: 'No se puede quitar el email: es el usuario de ingreso de este cliente' });
    }

    const cliente = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.cliente.update({
        where: { id },
        data: {
          ...(nombre && { nombre: nombre.trim() }),
          ...(req.body.tipo && { tipo: tipoFinal }),
          ...empresa.datos,
          ...(cedula !== undefined && { cedula: cedula?.trim() || null }),
          ...(telefono !== undefined && { telefono: telefono?.trim() || null }),
          ...(emailNormalizado !== undefined && { email: emailNormalizado }),
          ...(estado && { estado })
        }
      });
      if (actual.usuario) {
        await tx.usuario.update({
          where: { id: actual.usuario.id },
          data: {
            ...(emailNormalizado && { username: emailNormalizado }),
            ...(estado && { estado })
          }
        });
      }
      return actualizado;
    });

    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar cliente' });
  }
};

// "Eliminar" = suspender: la ficha se conserva porque sus reservas históricas
// la referencian. Suspende también el acceso al sitio.
const eliminar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cliente = await prisma.cliente.findUnique({ where: { id }, include: { usuario: true } });
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.cliente.update({ where: { id }, data: { estado: 'inactivo' } });
      if (cliente.usuario) {
        await tx.usuario.update({ where: { id: cliente.usuario.id }, data: { estado: 'inactivo' } });
      }
    });

    res.json({ success: true, message: 'Cliente suspendido' });
  } catch (error) {
    console.error('Error suspendiendo cliente:', error);
    res.status(500).json({ success: false, message: 'Error al suspender cliente' });
  }
};

module.exports = { listar, obtener, crear, generarAcceso, actualizar, eliminar };
