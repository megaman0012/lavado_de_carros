// Precios del catálogo - Total Clean Car
import { TipoServicio, PrecioServicio, ServicioAdicional } from '../types';

// Tarifa activa de un servicio para un tipo de vehículo; undefined = no se ofrece
export const tarifaPara = (servicio: TipoServicio | null | undefined, idTipoVehiculo?: number | null): PrecioServicio | undefined =>
  idTipoVehiculo ? servicio?.precios?.find((p) => p.id_tipo_vehiculo === idTipoVehiculo && p.activo !== false) : undefined;

export const dinero = (n?: number | null) => `$${(n ?? 0).toFixed(2)}`;

// Precio y minutos de la reserva: servicio para ese tipo + adicionales elegidos
export const totales = (tarifa: PrecioServicio | undefined, adicionales: ServicioAdicional[]) => ({
  precio: (tarifa?.precio ?? 0) + adicionales.reduce((s, a) => s + a.precio, 0),
  duracion: (tarifa?.duracion_min ?? 0) + adicionales.reduce((s, a) => s + a.duracion_min, 0)
});
