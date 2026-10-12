/**
 * Controlador de Lavadores - Total Clean Car
 */

const prisma = require('../db');
const sesionService = require('../services/sesion.service');
const { generarPasswordTemporal, hashear } = require('../utils/credenciales');
const alcance = require('../utils/alcance');

// El lavador existe y es de la ciudad de quien lo pide; si no, responde y devuelve null
const lavadorEnAlcance = async (req, res, id) => {
  const lavador = await prisma.lavador.findUnique({ where: { id }, include: { usuario: true } });
  if (!lavador) {
    res.status(404).json({ success: false, message: 'Lavador no encontrado' });
    return null;
  }
  if (!alcance.puedeVer(req.usuario, lavador.id_ciudad)) {
    alcance.fueraDeAlcance(res);
    return null;
  }
  return lavador;
};

// Ciudad para un lavador nuevo o trasladado. Un operador de ciudad solo da de
// alta en la suya (si no la manda, se usa esa).
const ciudadValida = async (req, res, valor) => {
  const id = alcance.aEntero(valor) || alcance.ciudadFija(req.usuario);
  if (!id) {
    res.status(400).json({ success: false, message: 'La ciudad es obligatoria' });
    return null;
  }
  if (!alcance.puedeVer(req.usuario, id)) {
    alcance.fueraDeAlcance(res);
    return null;
  }
  const ciudad = await prisma.ciudad.findUnique({ where: { id } });
  if (!ciudad || !ciudad.activa) {
    res.status(400).json({ success: false, message: 'Ciudad inexistente o inactiva' });
    return null;
  }
  return id;
};

const listar = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    const ciudad = alcance.ciudadFiltro(req);
    if (ciudad) where.id_ciudad = ciudad;

    const lavadores = await prisma.lavador.findMany({
      where,
      include: {
        usuario: { select: { id: true, username: true, estado: true } },
        ciudad: { select: { id: true, nombre: true } }
      },
      orderBy: { nombre: 'asc' }
    });
    res.json({ success: true, data: lavadores });
  } catch (error) {
    console.error('Error listando lavadores:', error);
    res.status(500).json({ success: false, message: 'Error al listar lavadores' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, cedula, telefono } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const id_ciudad = await ciudadValida(req, res, req.body.id_ciudad);
    if (!id_ciudad) return;
    const lavador = await prisma.lavador.create({
      data: {
        nombre: nombre.trim(),
        id_ciudad,
        cedula: cedula?.trim() || null,
        telefono: telefono?.trim() || null
      }
    });
    res.status(201).json({ success: true, data: lavador });
  } catch (error) {
    console.error('Error creando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al crear lavador' });
  }
};

// Ojo: suspender un lavador (o pasarlo a otra ciudad) reduce la capacidad
// expresa de su ciudad, porque agenda.service.obtenerCapacidad() cuenta los
// lavadores activos de la ciudad del sitio. Además le cierra el acceso al
// sistema (antes la ficha quedaba inactiva pero seguía entrando).
const actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, cedula, telefono, estado } = req.body;

    if (estado && !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido (activo | inactivo)' });
    }

    const actual = await lavadorEnAlcance(req, res, id);
    if (!actual) return;
    let id_ciudad;
    if (req.body.id_ciudad !== undefined && alcance.aEntero(req.body.id_ciudad) !== actual.id_ciudad) {
      id_ciudad = await ciudadValida(req, res, req.body.id_ciudad);
      if (!id_ciudad) return;
    }

    const lavador = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.lavador.update({
        where: { id },
        data: {
          ...(nombre && { nombre: nombre.trim() }),
          ...(cedula !== undefined && { cedula: cedula?.trim() || null }),
          ...(telefono !== undefined && { telefono: telefono?.trim() || null }),
          ...(id_ciudad && { id_ciudad }),
          ...(estado && { estado })
        }
      });
      if (estado && actual.usuario) {
        await tx.usuario.update({ where: { id: actual.usuario.id }, data: { estado } });
      }
      return actualizado;
    });

    res.json({ success: true, data: lavador });
  } catch (error) {
    console.error('Error actualizando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar lavador' });
  }
};

// "Eliminar" = suspender. La ficha se conserva porque las asignaciones de agenda
// históricas la referencian.
const eliminar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lavador = await lavadorEnAlcance(req, res, id);
    if (!lavador) return;

    await prisma.$transaction(async (tx) => {
      await tx.lavador.update({ where: { id }, data: { estado: 'inactivo' } });
      if (lavador.usuario) {
        await tx.usuario.update({ where: { id: lavador.usuario.id }, data: { estado: 'inactivo' } });
      }
    });

    res.json({ success: true, message: 'Lavador suspendido' });
  } catch (error) {
    console.error('Error suspendiendo lavador:', error);
    res.status(500).json({ success: false, message: 'Error al suspender lavador' });
  }
};

/**
 * Crea o actualiza la cuenta con la que el lavador entra al sistema (pantalla
 * "Mis trabajos"). Hasta ahora no existía forma de hacerlo: los únicos usuarios
 * lavador eran los del seed, así que cualquier lavador dado de alta desde el
 * panel no podía ingresar.
 * Si se crea sin contraseña, se genera una provisional y se devuelve una sola vez.
 */
const guardarUsuario = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { username, password } = req.body;

    const lavador = await prisma.lavador.findUnique({ where: { id }, include: { usuario: true } });
    if (!lavador) return res.status(404).json({ success: false, message: 'Lavador no encontrado' });

    const usuarioNormalizado = username?.trim().toLowerCase();
    if (!usuarioNormalizado && !lavador.usuario) {
      return res.status(400).json({ success: false, message: 'El nombre de usuario es obligatorio' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    if (usuarioNormalizado) {
      const ocupado = await prisma.usuario.findUnique({ where: { username: usuarioNormalizado } });
      if (ocupado && ocupado.id_lavador !== id) {
        return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso' });
      }
    }

    let passwordTemporal = null;
    let resultado;

    if (lavador.usuario) {
      resultado = await prisma.usuario.update({
        where: { id: lavador.usuario.id },
        data: {
          ...(usuarioNormalizado && { username: usuarioNormalizado }),
          ...(password && { password: await hashear(password) })
        },
        select: { id: true, username: true, estado: true }
      });
      // Igual que en resetPassword: cambiar la contraseña corta las sesiones abiertas.
      if (password) await sesionService.revocarUsuario(lavador.usuario.id);
    } else {
      passwordTemporal = password || generarPasswordTemporal();
      resultado = await prisma.usuario.create({
        data: {
          username: usuarioNormalizado,
          password: await hashear(passwordTemporal),
          rol: 'lavador',
          id_lavador: id,
          estado: lavador.estado === 'activo' ? 'activo' : 'inactivo'
        },
        select: { id: true, username: true, estado: true }
      });
      if (password) passwordTemporal = null; // la eligió el operador, no hace falta mostrarla
    }

    res.json({
      success: true,
      data: { ...resultado, password_temporal: passwordTemporal },
      message: lavador.usuario ? 'Cuenta actualizada' : 'Cuenta creada'
    });
  } catch (error) {
    console.error('Error guardando usuario del lavador:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la cuenta del lavador' });
  }
};

// Restablece la contraseña y devuelve una provisional una sola vez
const resetPassword = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lavador = await prisma.lavador.findUnique({ where: { id }, include: { usuario: true } });
    if (!lavador) return res.status(404).json({ success: false, message: 'Lavador no encontrado' });
    if (!lavador.usuario) {
      return res.status(400).json({ success: false, message: 'Este lavador todavía no tiene cuenta de acceso' });
    }

    const passwordTemporal = generarPasswordTemporal();
    await prisma.usuario.update({
      where: { id: lavador.usuario.id },
      data: { password: await hashear(passwordTemporal) }
    });
    // Restablecer la contraseña tiene que echar de todos lados a quien estuviera
    // dentro con la anterior: si no, el refresh token viejo seguiría renovando
    // la sesión por días y el cambio de contraseña no serviría de nada.
    await sesionService.revocarUsuario(lavador.usuario.id);

    res.json({
      success: true,
      data: { username: lavador.usuario.username, password_temporal: passwordTemporal },
      message: 'Contraseña restablecida'
    });
  } catch (error) {
    console.error('Error restableciendo contraseña del lavador:', error);
    res.status(500).json({ success: false, message: 'Error al restablecer la contraseña' });
  }
};

// Asignar/quitar lavador de una franja de agenda
const asignarLavador = async (req, res) => {
  try {
    const { id_lavador } = req.body;
    const actual = await prisma.asignacionAgenda.findUnique({
      where: { id: parseInt(req.params.asignacionId) },
      include: { reserva: { select: { estacionamiento: { select: { id_ciudad: true } } } } }
    });
    if (!actual) return res.status(404).json({ success: false, message: 'Franja no encontrada' });
    // La ciudad de la franja: la del sitio de la reserva o la del bloqueo
    const ciudadFranja = actual.reserva?.estacionamiento?.id_ciudad ?? actual.id_ciudad;
    if (!alcance.puedeVer(req.usuario, ciudadFranja)) return alcance.fueraDeAlcance(res);
    if (id_lavador) {
      const lavador = await prisma.lavador.findUnique({ where: { id: parseInt(id_lavador) } });
      if (!lavador) return res.status(400).json({ success: false, message: 'Lavador inexistente' });
      if (ciudadFranja && lavador.id_ciudad !== ciudadFranja) {
        return res.status(400).json({ success: false, message: `${lavador.nombre} trabaja en otra ciudad` });
      }
    }
    const asignacion = await prisma.asignacionAgenda.update({
      where: { id: actual.id },
      data: { id_lavador: id_lavador ? parseInt(id_lavador) : null },
      include: { lavador: { select: { id: true, nombre: true } }, reserva: { select: { codigo: true } } }
    });
    res.json({ success: true, data: asignacion });
  } catch (error) {
    console.error('Error asignando lavador:', error);
    res.status(500).json({ success: false, message: 'Error al asignar lavador' });
  }
};

module.exports = { listar, crear, actualizar, eliminar, guardarUsuario, resetPassword, asignarLavador };
