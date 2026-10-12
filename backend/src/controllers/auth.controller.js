/**
 * Controlador de Autenticación - Total Clean Car
 */

const bcrypt = require('bcryptjs');

const prisma = require('../db');
const sesionService = require('../services/sesion.service');

// Auto-registro público de cliente (crea Cliente + Usuario rol cliente)
const registrar = async (req, res) => {
  try {
    const { nombre, cedula, telefono, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, email y contraseña son obligatorios'
      });
    }

    const existe = await prisma.usuario.findUnique({ where: { username: email } });
    if (existe) {
      return res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese email' });
    }

    const hash = await bcrypt.hash(password, 10);

    const resultado = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.create({
        data: { nombre: nombre.trim(), cedula: cedula?.trim() || null, telefono: telefono?.trim() || null, email: email.trim().toLowerCase() }
      });
      const usuario = await tx.usuario.create({
        data: { username: email.trim().toLowerCase(), password: hash, rol: 'cliente', id_cliente: cliente.id }
      });
      return { cliente, usuario };
    });

    const sesion = await sesionService.abrirSesion(resultado.usuario);

    res.status(201).json({
      success: true,
      data: {
        ...sesion,
        usuario: { id: resultado.usuario.id, username: resultado.usuario.username, rol: 'cliente', nombre: resultado.cliente.nombre }
      }
    });
  } catch (error) {
    console.error('Error registrando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al registrar' });
  }
};

/**
 * Lo que el frontend sabe del usuario. `ciudad` es la que limita lo que ve
 * (la del operador o la del lavador); null = alcance nacional.
 */
const usuarioPublico = (usuario) => ({
  id: usuario.id,
  username: usuario.username,
  rol: usuario.rol,
  cliente: usuario.cliente && { id: usuario.cliente.id, nombre: usuario.cliente.nombre },
  lavador: usuario.lavador && { id: usuario.lavador.id, nombre: usuario.lavador.nombre },
  ciudad: usuario.lavador?.ciudad || usuario.ciudad || null
});

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: {
        cliente: { select: { id: true, nombre: true, estado: true } },
        lavador: { select: { id: true, nombre: true, estado: true, ciudad: { select: { id: true, nombre: true } } } },
        ciudad: { select: { id: true, nombre: true } }
      }
    });

    if (!usuario) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    // El aviso de suspensión se da recién con la contraseña correcta: así el
    // cliente entiende por qué no entra, sin revelarle a un extraño qué cuentas
    // existen. La ficha se suspende desde el panel y el acceso cae con ella.
    const suspendido = usuario.estado !== 'activo' ||
      (usuario.cliente && usuario.cliente.estado !== 'activo') ||
      (usuario.lavador && usuario.lavador.estado !== 'activo');
    if (suspendido) {
      return res.status(403).json({ success: false, message: 'Esta cuenta está suspendida. Comuníquese con nosotros.' });
    }

    const sesion = await sesionService.abrirSesion(usuario);

    res.json({
      success: true,
      data: {
        ...sesion,
        usuario: usuarioPublico(usuario)
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
  }
};

const perfil = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: {
        id: true, username: true, rol: true, estado: true,
        cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
        lavador: { select: { id: true, nombre: true, ciudad: { select: { id: true, nombre: true } } } },
        ciudad: { select: { id: true, nombre: true } }
      }
    });
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: usuario });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ success: false, message: 'Error al obtener perfil' });
  }
};

/**
 * POST /api/auth/refresh { refresh_token }
 *
 * Lo llama el cliente solo, sin intervención del usuario, cuando el token de
 * acceso venció (15 min). Devuelve uno nuevo y REEMPLAZA el refresh token: el
 * anterior queda quemado, así que el cliente tiene que guardar el que viene acá.
 */
const refrescar = async (req, res) => {
  try {
    const { usuario, ...sesion } = await sesionService.refrescar(req.body?.refresh_token);
    res.json({
      success: true,
      data: {
        ...sesion,
        usuario: usuarioPublico(usuario)
      }
    });
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({ success: false, message: error.message });
    }
    console.error('Error refrescando la sesión:', error);
    res.status(500).json({ success: false, message: 'Error al renovar la sesión' });
  }
};

/**
 * POST /api/auth/logout { refresh_token }
 *
 * Revoca la sesión en el servidor, no solo en este navegador. Responde 200
 * siempre: para el usuario cerrar sesión no puede "fallar", y distinguir entre
 * un token válido y uno inventado le diría a un atacante cuál acertó.
 */
const cerrarSesion = async (req, res) => {
  try {
    await sesionService.cerrarSesion(req.body?.refresh_token);
  } catch (error) {
    console.error('Error cerrando la sesión:', error);
  }
  res.json({ success: true, message: 'Sesión cerrada' });
};

module.exports = { registrar, login, perfil, refrescar, cerrarSesion };
