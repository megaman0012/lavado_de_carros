/**
 * Cotización de una reserva - Total Clean Car
 *
 * Único lugar donde se decide cuánto cuesta y cuánto dura un lavado:
 *   precio y duración del servicio para el TIPO de vehículo (PrecioServicio)
 *   + precio y minutos de cada servicio adicional elegido.
 *
 * Como la taquilla de un cine: la película (servicio) cuesta distinto según la
 * sala (tipo de vehículo), y la confitería (adicionales) se suma aparte.
 * Crear reserva y la vista previa del cliente usan esta misma función, así lo
 * que se muestra es lo que se cobra.
 */

const prisma = require('../db');

const error400 = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 400 });

// Normaliza la lista de adicionales: acepta [1, 2] o ["1", "2"], sin repetidos
const idsAdicionales = (lista) => {
  if (!lista) return [];
  if (!Array.isArray(lista)) throw error400('adicionales debe ser una lista de ids');
  const ids = [...new Set(lista.map((x) => parseInt(x)))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw error400('Id de adicional inválido');
  return ids;
};

/**
 * @returns {{ servicio, tipoVehiculo, precio_servicio, duracion_servicio,
 *             adicionales: {id,nombre,precio,duracion_min}[],
 *             precio_adicionales, duracion_min, total }}
 */
const cotizar = async ({ idTipoServicio, idTipoVehiculo, adicionales, db = prisma }) => {
  const servicio = await db.tipoServicio.findUnique({ where: { id: parseInt(idTipoServicio) } });
  if (!servicio || !servicio.activo) throw error400('Servicio no disponible');

  if (!idTipoVehiculo) {
    throw error400('El vehículo no tiene tipo registrado (moto, liviano, SUV...). Actualícelo antes de reservar.');
  }
  const tarifa = await db.precioServicio.findUnique({
    where: {
      id_tipo_servicio_id_tipo_vehiculo: {
        id_tipo_servicio: servicio.id,
        id_tipo_vehiculo: parseInt(idTipoVehiculo)
      }
    },
    include: { tipoVehiculo: true }
  });
  if (!tarifa || !tarifa.activo || !tarifa.tipoVehiculo.activo) {
    throw error400(`"${servicio.nombre}" no está disponible para este tipo de vehículo`);
  }

  const ids = idsAdicionales(adicionales);
  const extras = ids.length
    ? await db.servicioAdicional.findMany({ where: { id: { in: ids }, activo: true }, orderBy: { orden_display: 'asc' } })
    : [];
  if (extras.length !== ids.length) throw error400('Alguno de los servicios adicionales no está disponible');

  const precioAdicionales = extras.reduce((s, a) => s + a.precio, 0);
  const minutosAdicionales = extras.reduce((s, a) => s + a.duracion_min, 0);

  return {
    servicio,
    tipoVehiculo: tarifa.tipoVehiculo,
    precio_servicio: tarifa.precio,
    duracion_servicio: tarifa.duracion_min,
    adicionales: extras.map((a) => ({ id: a.id, nombre: a.nombre, precio: a.precio, duracion_min: a.duracion_min })),
    precio_adicionales: precioAdicionales,
    duracion_min: tarifa.duracion_min + minutosAdicionales,
    total: tarifa.precio + precioAdicionales
  };
};

module.exports = { cotizar };
