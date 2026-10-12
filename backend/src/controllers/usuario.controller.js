/**
 * Controlador de Usuarios internos - Total Clean Car
 *
 * Cuentas de administradores y operadores. Hasta la expansión por ciudades no
 * había forma de crear operadores desde el panel (el único salía del seed); con
 * un operador por ciudad, eso pasa a ser tarea de todos los días.
 *
 * Solo el admin entra acá. Las cuentas de lavadores y clientes se manejan desde
 * sus propias fichas (Lavadores, Clientes).
 */

const prisma = require('../db');
const sesionService = require('../services/sesion.service');
const { generarPasswordTemporal, hashear } = require('../utils/credenciales');
const { aEntero } = require('../utils/alcance');

const seleccion = {
  id: true, username: true, rol: true, estado: true, createdAt: true, id_ciudad: true,
  ciudad: { select: { id: true, nombre: true } }
};

const listar = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { rol: { in: ['admin', 'operador'] } },
      select: seleccion,
      orderBy: [{ rol: 'asc' }, { username: 'asc' }]
    });
    res.json({ success: true, data: usuarios });
  } catch (error) {
    console.error('Error listando usuarios internos:', error);
    res.status(500).json({ success: false, message: 'Error al listar usuarios' });
  }
};

// null / '' = alcance nacional; si viene, tiene que ser una ciudad activa
const ciudadOpcional = async (valor) => {
  if (valor === null || valor === undefined || valor === '') return { id: null };
  const id = aEntero(valor);
  const ciudad = id && (await prisma.ciudad.findUnique({ where: { id } }));
  if (!ciudad || !ciudad.activa) return { error: 'Ciudad inexistente o inactiva' };
  return { id };
};

// POST /api/usuarios { username, password?, id_ciudad? } — crea un operador.
// Sin contraseña se genera una provisional, que se devuelve una sola vez.
const crear = async (req, res) => {
  try {
    const username = req.body.username?.trim().toLowerCase();
    const { password } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'El nombre de usuario es obligatorio' });
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const ciudad = await ciudadOpcional(req.body.id_ciudad);
    if (ciudad.error) return res.status(400).json({ success: false, message: ciudad.error });

    const clave = password || generarPasswordTemporal();
    const usuario = await prisma.usuario.create({
      data: { username, password: await hashear(clave), rol: 'operador', id_ciudad: ciudad.id },
      select: seleccion
    });
    res.status(201).json({
      success: true,
      data: { ...usuario, password_temporal: password ? null : clave },
      message: 'Operador creado'
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso' });
    }
    console.error('Error creando operador:', error);
    res.status(500).json({ success: false, message: 'Error al crear el operador' });
  }
};

// PUT /api/usuarios/:id { id_ciudad?, estado? } — traslada o suspende a un operador
const actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actual = await prisma.usuario.findUnique({ where: { id } });
    if (!actual || !['admin', 'operador'].includes(actual.rol)) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (actual.id === req.usuario.id) {
      return res.status(400).json({ success: false, message: 'No puede modificar su propia cuenta desde aquí' });
    }
    const { estado } = req.body;
    if (estado && !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido (activo | inactivo)' });
    }
    let id_ciudad;
    if (req.body.id_ciudad !== undefined) {
      if (actual.rol === 'admin') {
        return res.status(400).json({ success: false, message: 'El administrador siempre tiene alcance nacional' });
      }
      const ciudad = await ciudadOpcional(req.body.id_ciudad);
      if (ciudad.error) return res.status(400).json({ success: false, message: ciudad.error });
      id_ciudad = ciudad.id;
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { ...(id_ciudad !== undefined && { id_ciudad }), ...(estado && { estado }) },
      select: seleccion
    });
    // Suspender tiene que sacarlo ya, no cuando le venza el refresco
    if (estado === 'inactivo') await sesionService.revocarUsuario(id);
    res.json({ success: true, data: usuario });
  } catch (error) {
    console.error('Error actualizando usuario interno:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el usuario' });
  }
};

// POST /api/usuarios/:id/reset — contraseña provisional, mostrada una sola vez
const resetPassword = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actual = await prisma.usuario.findUnique({ where: { id } });
    if (!actual || actual.rol !== 'operador') {
      return res.status(404).json({ success: false, message: 'Operador no encontrado' });
    }
    const passwordTemporal = generarPasswordTemporal();
    await prisma.usuario.update({ where: { id }, data: { password: await hashear(passwordTemporal) } });
    await sesionService.revocarUsuario(id);
    res.json({
      success: true,
      data: { username: actual.username, password_temporal: passwordTemporal },
      message: 'Contraseña restablecida'
    });
  } catch (error) {
    console.error('Error restableciendo contraseña del operador:', error);
    res.status(500).json({ success: false, message: 'Error al restablecer la contraseña' });
  }
};

module.exports = { listar, crear, actualizar, resetPassword };
