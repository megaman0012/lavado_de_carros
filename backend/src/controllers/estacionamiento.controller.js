/**
 * Controlador de Estacionamientos y Plazas - Total Clean Car
 */

const prisma = require('../db');
const alcance = require('../utils/alcance');

const TIPOS = ['aliado', 'taller'];

// El sitio existe y es de la ciudad de quien lo pide; si no, responde y devuelve null
const sitioEnAlcance = async (req, res, id) => {
  const est = await prisma.estacionamiento.findUnique({ where: { id } });
  if (!est) {
    res.status(404).json({ success: false, message: 'Estacionamiento no encontrado' });
    return null;
  }
  if (!alcance.puedeVer(req.usuario, est.id_ciudad)) {
    alcance.fueraDeAlcance(res);
    return null;
  }
  return est;
};

// Ciudad válida para un sitio nuevo o editado: un operador de ciudad solo puede usar la suya
const validarCiudad = async (req, res, idCiudad) => {
  const id = alcance.aEntero(idCiudad);
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

// ==================== ESTACIONAMIENTOS ====================

const listar = async (req, res) => {
  try {
    const { estado, tipo } = req.query;
    const where = {};
    const ciudad = alcance.ciudadFiltro(req);
    if (ciudad) where.id_ciudad = ciudad;
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;

    const estacionamientos = await prisma.estacionamiento.findMany({
      where,
      include: {
        ciudad: { select: { id: true, nombre: true } },
        plazas: true,
        _count: { select: { plazas: true } },
        suscripciones: { where: { estado: 'activa' }, include: { plan: true } }
      },
      orderBy: [{ ciudad: { nombre: 'asc' } }, { nombre: 'asc' }]
    });
    res.json({ success: true, data: estacionamientos });
  } catch (error) {
    console.error('Error listando estacionamientos:', error);
    res.status(500).json({ success: false, message: 'Error al listar estacionamientos' });
  }
};

const obtener = async (req, res) => {
  try {
    const estacionamiento = await prisma.estacionamiento.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        ciudad: { select: { id: true, nombre: true } },
        plazas: { orderBy: { codigo: 'asc' } },
        reservas: { take: 20, orderBy: { createdAt: 'desc' } }
      }
    });
    if (!estacionamiento) return res.status(404).json({ success: false, message: 'Estacionamiento no encontrado' });
    if (!alcance.puedeVer(req.usuario, estacionamiento.id_ciudad)) return alcance.fueraDeAlcance(res);
    res.json({ success: true, data: estacionamiento });
  } catch (error) {
    console.error('Error obteniendo estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estacionamiento' });
  }
};

const crear = async (req, res) => {
  try {
    const {
      nombre, direccion, contacto, horario_apertura, horario_cierre, admite_expreso, cantidad_plazas,
      capacidad_expreso, duracion_franja_min, tipo
    } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido (${TIPOS.join(' | ')})` });
    }
    const id_ciudad = await validarCiudad(req, res, req.body.id_ciudad);
    if (!id_ciudad) return;
    const esTaller = tipo === 'taller';

    const estacionamiento = await prisma.$transaction(async (tx) => {
      const est = await tx.estacionamiento.create({
        data: {
          nombre: nombre.trim(),
          direccion: direccion?.trim() || null,
          id_ciudad,
          tipo: esTaller ? 'taller' : 'aliado',
          contacto: contacto?.trim() || null,
          horario_apertura: horario_apertura || '07:00',
          horario_cierre: horario_cierre || '18:00',
          // En el taller el cliente lleva el carro: ahí no se hace expreso
          admite_expreso: !esTaller && admite_expreso !== false,
          capacidad_expreso: Math.max(parseInt(capacidad_expreso) || 0, 0),
          duracion_franja_min: Math.max(parseInt(duracion_franja_min) || 60, 0)
        }
      });
      // En un taller las plazas son las bahías de lavado (B-01...): son su capacidad
      const n = parseInt(cantidad_plazas) || 0;
      for (let p = 1; p <= n; p++) {
        await tx.plaza.create({
          data: {
            id_estacionamiento: est.id,
            codigo: `${esTaller ? 'B' : 'P'}-${String(p).padStart(2, '0')}`,
            tipo: esTaller ? 'bahia_lavado' : 'estacionamiento'
          }
        });
      }
      return est;
    });

    res.status(201).json({ success: true, data: estacionamiento });
  } catch (error) {
    console.error('Error creando estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al crear estacionamiento' });
  }
};

const actualizar = async (req, res) => {
  try {
    const {
      nombre, direccion, contacto, horario_apertura, horario_cierre, admite_expreso, estado,
      capacidad_expreso, duracion_franja_min, tipo
    } = req.body;
    const actual = await sitioEnAlcance(req, res, parseInt(req.params.id));
    if (!actual) return;
    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido (${TIPOS.join(' | ')})` });
    }
    let id_ciudad;
    if (req.body.id_ciudad !== undefined && alcance.aEntero(req.body.id_ciudad) !== actual.id_ciudad) {
      id_ciudad = await validarCiudad(req, res, req.body.id_ciudad);
      if (!id_ciudad) return;
    }
    const estacionamiento = await prisma.estacionamiento.update({
      where: { id: actual.id },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(direccion !== undefined && { direccion: direccion?.trim() || null }),
        ...(id_ciudad && { id_ciudad }),
        ...(tipo && { tipo }),
        // Un taller nunca admite expreso, aunque el formulario lo mande marcado
        ...((tipo || actual.tipo) === 'taller' && { admite_expreso: false }),
        ...(contacto !== undefined && { contacto: contacto?.trim() || null }),
        ...(horario_apertura && { horario_apertura }),
        ...(horario_cierre && { horario_cierre }),
        ...(admite_expreso !== undefined && (tipo || actual.tipo) !== 'taller' && { admite_expreso }),
        ...(estado && { estado }),
        ...(capacidad_expreso !== undefined && { capacidad_expreso: Math.max(parseInt(capacidad_expreso) || 0, 0) }),
        ...(duracion_franja_min !== undefined && { duracion_franja_min: Math.max(parseInt(duracion_franja_min) || 0, 0) })
      }
    });
    res.json({ success: true, data: estacionamiento });
  } catch (error) {
    console.error('Error actualizando estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar estacionamiento' });
  }
};

const eliminar = async (req, res) => {
  try {
    const actual = await sitioEnAlcance(req, res, parseInt(req.params.id));
    if (!actual) return;
    await prisma.estacionamiento.update({
      where: { id: actual.id },
      data: { estado: 'inactivo' }
    });
    res.json({ success: true, message: 'Estacionamiento desactivado' });
  } catch (error) {
    console.error('Error eliminando estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar estacionamiento' });
  }
};

// ==================== PLAZAS ====================

const listarPlazas = async (req, res) => {
  try {
    const { tipo, estado } = req.query;
    // La ruta es /:id/plazas; se acepta también ?id_estacionamiento= para listar sin anidar en un sitio.
    const id_estacionamiento = req.params.id || req.query.id_estacionamiento;
    const where = {};
    if (id_estacionamiento) where.id_estacionamiento = parseInt(id_estacionamiento);
    const ciudad = alcance.ciudadFiltro(req);
    if (ciudad) where.estacionamiento = { is: { id_ciudad: ciudad } };
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;

    const plazas = await prisma.plaza.findMany({
      where,
      include: { estacionamiento: { select: { id: true, nombre: true } } },
      orderBy: { codigo: 'asc' }
    });
    res.json({ success: true, data: plazas });
  } catch (error) {
    console.error('Error listando plazas:', error);
    res.status(500).json({ success: false, message: 'Error al listar plazas' });
  }
};

const crearPlaza = async (req, res) => {
  try {
    const { id_estacionamiento, codigo, tipo, estado } = req.body;
    if (!id_estacionamiento || !codigo) {
      return res.status(400).json({ success: false, message: 'Estacionamiento y código son obligatorios' });
    }
    if (!(await sitioEnAlcance(req, res, parseInt(id_estacionamiento)))) return;
    const plaza = await prisma.plaza.create({
      data: {
        id_estacionamiento: parseInt(id_estacionamiento),
        codigo: codigo.trim().toUpperCase(),
        tipo: tipo || 'estacionamiento',
        ...(estado && { estado })
      }
    });
    res.status(201).json({ success: true, data: plaza });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Ya existe una plaza con ese código en el estacionamiento' });
    }
    console.error('Error creando plaza:', error);
    res.status(500).json({ success: false, message: 'Error al crear plaza' });
  }
};

const actualizarPlaza = async (req, res) => {
  try {
    const { codigo, tipo, estado } = req.body;
    const actual = await prisma.plaza.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!actual) return res.status(404).json({ success: false, message: 'Plaza no encontrada' });
    if (!(await sitioEnAlcance(req, res, actual.id_estacionamiento))) return;
    const plaza = await prisma.plaza.update({
      where: { id: actual.id },
      data: {
        ...(codigo && { codigo: codigo.trim().toUpperCase() }),
        ...(tipo && { tipo }),
        ...(estado && { estado })
      }
    });
    res.json({ success: true, data: plaza });
  } catch (error) {
    console.error('Error actualizando plaza:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar plaza' });
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar, listarPlazas, crearPlaza, actualizarPlaza };
