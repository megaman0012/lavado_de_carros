/**
 * Controlador de Autenticación - Sistema de Lavado de Carros
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../db');
const config = require('../config');

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

    const token = jwt.sign(
      { id: resultado.usuario.id, username: resultado.usuario.username, rol: 'cliente', id_cliente: resultado.cliente.id },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      data: { token, usuario: { id: resultado.usuario.id, username: resultado.usuario.username, rol: 'cliente', nombre: resultado.cliente.nombre } }
    });
  } catch (error) {
    console.error('Error registrando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al registrar' });
  }
};

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
        lavador: { select: { id: true, nombre: true, estado: true } }
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

    const token = jwt.sign(
      {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        id_cliente: usuario.id_cliente || null,
        id_lavador: usuario.id_lavador || null
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: {
        token,
        usuario: {
          id: usuario.id,
          username: usuario.username,
          rol: usuario.rol,
          cliente: usuario.cliente && { id: usuario.cliente.id, nombre: usuario.cliente.nombre },
          lavador: usuario.lavador && { id: usuario.lavador.id, nombre: usuario.lavador.nombre }
        }
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
        lavador: { select: { id: true, nombre: true } }
      }
    });
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: usuario });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ success: false, message: 'Error al obtener perfil' });
  }
};

module.exports = { registrar, login, perfil };
