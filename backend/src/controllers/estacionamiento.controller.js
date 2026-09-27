/**
 * Controlador de Estacionamientos y Plazas - Total Clean Car
 */

const prisma = require('../db');

// ==================== ESTACIONAMIENTOS ====================

const listar = async (req, res) => {
  try {
    const { ciudad, estado } = req.query;
    const where = {};
    if (ciudad) where.ciudad = ciudad;
    if (estado) where.estado = estado;

    const estacionamientos = await prisma.estacionamiento.findMany({
      where,
      include: {
        plazas: true,
        _count: { select: { plazas: true } },
        suscripciones: { where: { estado: 'activa' }, include: { plan: true } }
      },
      orderBy: { nombre: 'asc' }
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
      include: { plazas: { orderBy: { codigo: 'asc' } }, reservas: { take: 20, orderBy: { createdAt: 'desc' } } }
    });
    if (!estacionamiento) return res.status(404).json({ success: false, message: 'Estacionamiento no encontrado' });
    res.json({ success: true, data: estacionamiento });
  } catch (error) {
    console.error('Error obteniendo estacionamiento:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estacionamiento' });
  }
};

const crear = async (req, res) => {
  try {
    const {
      nombre, direccion, ciudad, contacto, horario_apertura, horario_cierre, admite_expreso, cantidad_plazas,
      capacidad_expreso, duracion_franja_min
    } = req.body;
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }

    const estacionamiento = await prisma.$transaction(async (tx) => {
      const est = await tx.estacionamiento.create({
        data: {
          nombre: nombre.trim(),
          direccion: direccion?.trim() || null,
          ciudad: ciudad?.trim() || null,
          contacto: contacto?.trim() || null,
          horario_apertura: horario_apertura || '07:00',
          horario_cierre: horario_cierre || '18:00',
          admite_expreso: admite_expreso !== false,
          capacidad_expreso: Math.max(parseInt(capacidad_expreso) || 0, 0),
          duracion_franja_min: Math.max(parseInt(duracion_franja_min) || 60, 0)
        }
      });
      const n = parseInt(cantidad_plazas) || 0;
      for (let p = 1; p <= n; p++) {
        await tx.plaza.create({
          data: { id_estacionamiento: est.id, codigo: `P-${String(p).padStart(2, '0')}`, tipo: 'estacionamiento' }
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
      nombre, direccion, ciudad, contacto, horario_apertura, horario_cierre, admite_expreso, estado,
      capacidad_expreso, duracion_franja_min
    } = req.body;
    const estacionamiento = await prisma.estacionamiento.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(nombre && { nombre: nombre.trim() }),
        ...(direccion !== undefined && { direccion: direccion?.trim() || null }),
        ...(ciudad !== undefined && { ciudad: ciudad?.trim() || null }),
        ...(contacto !== undefined && { contacto: contacto?.trim() || null }),
        ...(horario_apertura && { horario_apertura }),
        ...(horario_cierre && { horario_cierre }),
        ...(admite_expreso !== undefined && { admite_expreso }),
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
    await prisma.estacionamiento.update({
      where: { id: parseInt(req.params.id) },
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
    const plaza = await prisma.plaza.update({
      where: { id: parseInt(req.params.id) },
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
