/**
 * Controlador de Clientes - Total Clean Car
 */

const prisma = require('../db');
const { generarPasswordTemporal, hashear } = require('../utils/credenciales');

const listar = async (req, res) => {
  try {
    const { estado, busqueda } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (busqueda) {
      where.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { email: { contains: busqueda, mode: 'insensitive' } },
        { cedula: { contains: busqueda } }
      ];
    }
    const clientes = await prisma.cliente.findMany({
      where,
      include: { vehiculos: true, usuario: { select: { id: true, username: true, rol: true } } },
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
      include: { vehiculos: true, reservas: true, usuario: { select: { id: true, username: true } } }
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
          nombre: nombre.trim(),
          cedula: cedula?.trim() || null,
          telefono: telefono?.trim() || null,
          email: emailNormalizado
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
