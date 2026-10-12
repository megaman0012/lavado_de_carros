// Tipos del dominio - Total Clean Car

export interface Usuario {
  id: number;
  username: string;
  rol: 'admin' | 'operador' | 'lavador' | 'cliente';
  // tipo 'empresa' = gestor de flota (ve "Mi flota")
  cliente?: { id: number; nombre: string; tipo?: 'persona' | 'empresa' };
  lavador?: { id: number; nombre: string };
  // Ciudad que limita lo que ve (operador de ciudad, lavador); null = nacional
  ciudad?: { id: number; nombre: string } | null;
}

// La operación es nacional y se organiza por ciudad
export interface Ciudad {
  id: number;
  nombre: string;
  provincia?: string | null;
  activa?: boolean;
  _count?: { estacionamientos: number; lavadores: number; usuarios: number };
}

// Cuenta de administrador u operador (pantalla Usuarios)
export interface UsuarioInterno {
  id: number;
  username: string;
  rol: 'admin' | 'operador';
  estado: string;
  id_ciudad: number | null;
  ciudad: { id: number; nombre: string } | null;
  createdAt?: string;
  // Solo al crear: se muestra una vez
  password_temporal?: string | null;
}

// Moto, liviano, SUV... Define qué servicios y a qué precio contrata un vehículo
export interface TipoVehiculo {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  orden_display?: number;
  activo?: boolean;
  _count?: { vehiculos: number };
}

// Precio y duración de un servicio para un tipo de vehículo
export interface PrecioServicio {
  id?: number;
  id_tipo_vehiculo: number;
  precio: number;
  duracion_min: number;
  activo?: boolean;
  tipoVehiculo?: Pick<TipoVehiculo, 'codigo' | 'nombre'> & { id?: number; activo?: boolean };
}

export interface TipoServicio {
  id: number;
  nombre: string;
  descripcion?: string | null;
  modalidad: 'expreso' | 'profunda';
  activo?: boolean;
  orden_display?: number;
  precios: PrecioServicio[];
  // Solo en el catálogo público: el precio más bajo entre los tipos de vehículo
  precio_desde?: number;
}

export interface ServicioAdicional {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  duracion_min: number;
  activo?: boolean;
  orden_display?: number;
}

// Adicional contratado en una reserva (copia de nombre/precio al reservar)
export interface ReservaAdicional {
  id: number;
  id_adicional: number;
  nombre: string;
  precio: number;
  duracion_min: number;
}

export interface Plaza {
  id: number;
  id_estacionamiento: number;
  codigo: string;
  tipo: 'estacionamiento' | 'bahia_lavado';
  estado: 'disponible' | 'ocupada' | 'mantenimiento';
  estacionamiento?: { id: number; nombre: string };
}

export interface Estacionamiento {
  id: number;
  nombre: string;
  direccion?: string | null;
  id_ciudad: number;
  ciudad?: { id: number; nombre: string };
  // aliado = edificio/condominio (expreso); taller = bahías de la limpieza profunda;
  // privado = parqueadero propio de una empresa
  tipo?: 'aliado' | 'taller' | 'privado';
  id_cliente?: number | null;
  empresa?: { id: number; nombre: string } | null;
  horario_apertura?: string;
  horario_cierre?: string;
  admite_expreso?: boolean;
  capacidad_expreso?: number;
  duracion_franja_min?: number;
  estado?: string;
  plazas?: Plaza[];
  suscripciones?: Suscripcion[];
}

export interface Vehiculo {
  id: number;
  id_cliente: number;
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  id_tipo_vehiculo?: number | null;
  tipoVehiculo?: Pick<TipoVehiculo, 'id' | 'codigo' | 'nombre'> | null;
  estado?: string;
  cliente?: { id: number; nombre: string };
}

export interface Cliente {
  id: number;
  // empresa = flota propia, tarifas pactadas y cobro a crédito con corte mensual
  tipo?: 'persona' | 'empresa';
  nombre: string;
  cedula?: string | null;
  ruc?: string | null;
  razon_social?: string | null;
  email_facturacion?: string | null;
  direccion_fiscal?: string | null;
  telefono?: string | null;
  email?: string | null;
  estado?: string;
  // Cuenta con la que el cliente entra al sitio; null = ficha sin acceso
  usuario?: { id: number; username: string; rol?: string } | null;
  vehiculos?: Vehiculo[];
  // Solo en la respuesta de creación / restablecimiento: se muestra una vez
  password_temporal?: string | null;
}

export interface Lavador {
  id: number;
  nombre: string;
  cedula?: string | null;
  telefono?: string | null;
  id_ciudad: number;
  ciudad?: { id: number; nombre: string };
  estado: string;
  // Cuenta con la que el lavador entra a "Mis trabajos"; null = no puede ingresar
  usuario?: { id: number; username: string; estado: string } | null;
}

export interface FranjaDisponibilidad {
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  ocupadas: number;
  cupos: number;
  // Función que ya empezó (hoy, hora pasada): no se vende
  pasada?: boolean;
  disponible: boolean;
}

export interface AsignacionAgenda {
  id: number;
  id_reserva: number | null;
  id_lavador?: number | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  nota?: string | null;
  // Alcance de un bloqueo manual: sitio, ciudad, o ninguno = nacional
  id_ciudad?: number | null;
  id_estacionamiento?: number | null;
  ciudad?: { id: number; nombre: string } | null;
  estacionamiento?: { id: number; nombre: string } | null;
  lavador?: { id: number; nombre: string } | null;
  reserva?: {
    id: number;
    codigo: string;
    estado: string;
    modalidad: string;
    cliente?: { nombre: string; telefono?: string };
    vehiculo?: { placa: string; marca?: string; modelo?: string; color?: string };
    tipoServicio?: { nombre: string };
    estacionamiento?: { nombre: string; ciudad?: { nombre: string } } | null;
    visita?: { id: number; codigo: string; estado: string; direccion: string; hora_salida: string; hora_regreso: string;
      sector?: { nombre: string }; unidad?: { nombre: string } } | null;
  } | null;
}

export interface HistorialReserva {
  id: number;
  id_reserva: number;
  accion: string;
  estado_anterior?: string | null;
  estado_nuevo?: string | null;
  motivo?: string | null;
  usuario?: string | null;
  fecha_cambio: string;
}

export interface Pago {
  id: number;
  id_reserva: number;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta';
  // en_verificacion = comprobante subido por el cliente, esperando aprobación
  estado: 'pendiente' | 'en_verificacion' | 'aprobado' | 'rechazado' | 'reembolsado';
  referencia?: string | null;
  // Comprobante de transferencia adjuntado por el operador (URL firmada)
  comprobante_url?: string | null;
  fecha_pago?: string | null;
  createdAt?: string;
  // Solo en la bandeja de verificación: contexto de la reserva del comprobante
  reserva?: Reserva & { total_pagado?: number; saldo?: number };
}

export interface RegistroLavado {
  id: number;
  id_reserva: number;
  checklist?: Record<string, boolean> | null;
  fotos_antes?: string | null; // JSON array de URLs
  fotos_despues?: string | null;
  observaciones?: string | null;
  fecha_fin?: string | null;
}

// fallida = lavado a domicilio que no se pudo hacer: se cobra el cargo de visita
export type EstadoReserva = 'solicitada' | 'confirmada' | 'en_proceso' | 'completada' | 'cancelada' | 'no_asistio' | 'fallida';

export interface Reserva {
  id: number;
  codigo: string;
  id_cliente: number;
  id_vehiculo: number;
  id_tipo_servicio: number;
  id_estacionamiento?: number | null;
  // remoto = a domicilio (tiene `visita` y no estacionamiento)
  modalidad: 'expreso' | 'profunda' | 'remoto';
  id_ciudad?: number;
  ciudad?: { id: number; nombre: string };
  id_visita?: number | null;
  visita?: Visita | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoReserva;
  observaciones?: string | null;
  precio_final?: number | null;
  // contado = se paga la reserva; credito = va al corte mensual de la empresa
  forma_cobro?: 'contado' | 'credito';
  id_corte?: number | null;
  // Reservada con plan VIP (ocupa primero los cupos apartados)
  vip?: boolean;
  cliente?: Cliente;
  vehiculo?: Vehiculo;
  tipoServicio?: TipoServicio;
  estacionamiento?: Estacionamiento | null;
  asignaciones?: AsignacionAgenda[];
  registro?: RegistroLavado | null;
  historial?: HistorialReserva[];
  pagos?: Pago[];
  id_suscripcion?: number | null;
  calificacion?: Calificacion | null;
  adicionales?: ReservaAdicional[];
}

export interface KPIs {
  lavados_hoy: number;
  lavados_semana: number;
  lavados_mes: number;
  ingresos_mes: number;
  solicitudes_pendientes: number;
  ocupacion_hoy_pct: number;
  calificacion_promedio: number | null;
  calificaciones_total: number;
  por_estado: { estado: string; cantidad: number }[];
}

// Totales del mes elegido en Reportes (GET /api/reportes/resumen).
// Distinto de KPIs, que siempre mira hoy/semana/mes y alimenta el Dashboard.
export interface ResumenPeriodo {
  desde: string;
  hasta: string;
  lavados: number;
  // Lo que suman los lavados del período...
  facturado: number;
  // ...y lo que efectivamente se cobró dentro de él. No tienen por qué coincidir.
  cobrado: number;
  // null cuando no hubo lavados: no es cero, es "no aplica"
  ticket_promedio: number | null;
  canceladas: number;
  no_asistio: number;
  // A domicilio: visitas que no se pudieron hacer y lo que se cobró por ellas
  visitas_fallidas?: number;
  // Mensualidades de planes VIP cobradas en el período (aparte del cobrado por lavados)
  cobrado_planes?: number;
  pagos_planes?: number;
  cargos_visitas_fallidas?: number;
  calificacion_promedio: number | null;
  calificaciones_total: number;
}

export interface Calificacion {
  id: number;
  id_reserva: number;
  id_cliente: number;
  puntuacion: number;
  comentario?: string | null;
  createdAt: string;
}

// sitio = de un edificio (lavados compartidos); personal = VIP de una persona
export interface Plan {
  id: number;
  nombre: string;
  descripcion?: string | null;
  tipo?: 'sitio' | 'personal';
  precio_mensual: number;
  lavados_incluidos: number;
  modalidad: 'expreso' | 'profunda' | 'todas';
  descuento_pct?: number;
  dias_anticipacion?: number | null;
  estado?: 'activo' | 'inactivo';
}

export type EstadoPagoPlan = 'pendiente' | 'en_verificacion' | 'aprobado' | 'rechazado';

// Cobro mensual de un plan VIP
export interface PagoSuscripcion {
  id: number;
  id_suscripcion: number;
  periodo: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia';
  estado: EstadoPagoPlan;
  comprobante_url?: string | null;
  referencia?: string | null;
  motivo_rechazo?: string | null;
  fecha_pago?: string | null;
  suscripcion?: Suscripcion;
}

// Respuesta de /api/mi-plan
export interface MiPlan {
  es_empresa: boolean;
  suscripcion: Suscripcion | null;
  restantes: number;
  dias_anticipacion: number;
  planes: Plan[];
}

// Titular: un sitio (plan de sitio) o una persona (plan VIP)
export interface Suscripcion {
  id: number;
  id_estacionamiento?: number | null;
  id_cliente?: number | null;
  id_plan: number;
  fecha_inicio: string;
  fecha_cancelacion?: string | null;
  estado: 'activa' | 'cancelada';
  plan?: Plan;
  estacionamiento?: { id: number; nombre: string; ciudad?: { id: number; nombre: string } } | null;
  cliente?: { id: number; nombre: string; email?: string | null; telefono?: string | null } | null;
  pagos?: PagoSuscripcion[];
  uso_mes_actual?: number;
  // Solo VIP: el cobro del mes en curso y si está pagado
  pago_mes_actual?: PagoSuscripcion | null;
  vigente?: boolean;
}

// ==================== EMPRESAS ====================

export type EstadoCorte = 'cerrado' | 'facturado' | 'pagado' | 'anulado';

export interface CorteEmpresa {
  id: number;
  codigo: string;
  id_cliente: number;
  periodo: string; // "2026-10"
  desde: string;
  hasta: string;
  cantidad: number;
  total: number;
  estado: EstadoCorte;
  numero_factura?: string | null;
  fecha_factura?: string | null;
  fecha_pago?: string | null;
  referencia_pago?: string | null;
  notas?: string | null;
  usuario?: string | null;
  createdAt?: string;
}

// Un lavado dentro de un corte (o de su vista previa)
export interface FilaCorte {
  id: number;
  codigo: string;
  fecha: string;
  hora: string;
  placa: string;
  vehiculo: string;
  tipo_vehiculo: string;
  servicio: string;
  adicionales: string;
  sitio: string;
  ciudad: string;
  total: number;
}

export interface PreviaCorte {
  periodo: string;
  desde: string;
  hasta: string;
  cantidad: number;
  total: number;
  de_periodos_anteriores: number;
  sin_completar: number;
  corte_existente: { id: number; codigo: string; estado: EstadoCorte } | null;
  filas: FilaCorte[];
}

// Fila de la tabla de tarifas de una empresa: precio de lista y pactado
export interface TarifaFila {
  id_tipo_servicio: number;
  id_tipo_vehiculo: number;
  servicio: string;
  modalidad: string;
  tipo_vehiculo: string;
  precio_lista: number;
  precio_empresa: number | null;
}

export interface EmpresaResumen extends Cliente {
  sitiosPrivados: { id: number; nombre: string; ciudad?: { nombre: string } }[];
  _count: { vehiculos: number; tarifas: number };
  ultimo_corte: Pick<CorteEmpresa, 'codigo' | 'periodo' | 'estado' | 'total'> | null;
  pendiente: { cantidad: number; total: number };
}

// ==================== LAVADO REMOTO ====================

export interface Sector {
  id: number;
  id_ciudad: number;
  nombre: string;
  traslado_min: number;
  recargo: number;
  activo?: boolean;
  ciudad?: { id: number; nombre: string };
}

export interface UnidadMovil {
  id: number;
  nombre: string;
  id_ciudad: number;
  capacidad: number;
  horario_inicio: string;
  horario_fin: string;
  lleva_agua: boolean;
  lleva_energia: boolean;
  estado: 'activo' | 'mantenimiento' | 'inactivo';
  ciudad?: { id: number; nombre: string };
  lavadores?: { id: number; nombre: string; estado: string }[];
}

export type EstadoVisita = 'programada' | 'en_camino' | 'en_sitio' | 'completada' | 'fallida' | 'cancelada';

export interface Visita {
  id: number;
  codigo: string;
  id_unidad: number;
  id_sector: number;
  direccion: string;
  referencia?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  contacto_nombre?: string | null;
  contacto_telefono?: string | null;
  tiene_agua: boolean;
  tiene_luz: boolean;
  fecha: string;
  hora_salida: string;
  hora_inicio: string;
  hora_fin: string;
  hora_regreso: string;
  traslado_min: number;
  recargo: number;
  estado: EstadoVisita;
  motivo_falla?: string | null;
  llegada_en?: string | null;
  llegada_latitud?: number | null;
  llegada_longitud?: number | null;
  sector?: { id: number; nombre: string; ciudad?: { nombre: string } };
  unidad?: { id: number; nombre: string };
  cliente?: { id: number; nombre: string; telefono?: string | null };
  reservas?: { id: number; codigo: string; estado: EstadoReserva; precio_final?: number | null; forma_cobro?: string;
    vehiculo?: { placa: string; marca?: string; modelo?: string }; tipoServicio?: { nombre: string } }[];
  // Solo al marcar la llegada: metros entre la marca GPS y la dirección
  distancia_m?: number | null;
}

// Datos de la dirección al pedir un lavado a domicilio
export interface DatosDomicilio {
  id_sector: number | '';
  direccion: string;
  referencia: string;
  contacto_nombre: string;
  contacto_telefono: string;
  tiene_agua: boolean;
  tiene_luz: boolean;
  latitud?: number | null;
  longitud?: number | null;
}

