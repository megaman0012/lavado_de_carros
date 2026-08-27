// Tipos del dominio - Sistema de Lavado de Carros

export interface Usuario {
  id: number;
  username: string;
  rol: 'admin' | 'operador' | 'lavador' | 'cliente';
  cliente?: { id: number; nombre: string };
  lavador?: { id: number; nombre: string };
}

export interface TipoServicio {
  id: number;
  nombre: string;
  descripcion?: string | null;
  modalidad: 'expreso' | 'profunda';
  duracion_min: number;
  precio: number;
  activo?: boolean;
  orden_display?: number;
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
  ciudad?: string | null;
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
  tipo?: string | null;
  cliente?: { id: number; nombre: string };
}

export interface Cliente {
  id: number;
  nombre: string;
  cedula?: string | null;
  telefono?: string | null;
  email?: string | null;
  vehiculos?: Vehiculo[];
}

export interface Lavador {
  id: number;
  nombre: string;
  cedula?: string | null;
  telefono?: string | null;
  estado: string;
}

export interface FranjaDisponibilidad {
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  ocupadas: number;
  cupos: number;
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
  lavador?: { id: number; nombre: string } | null;
  reserva?: {
    id: number;
    codigo: string;
    estado: string;
    modalidad: string;
    cliente?: { nombre: string; telefono?: string };
    vehiculo?: { placa: string; marca?: string; modelo?: string; color?: string };
    tipoServicio?: { nombre: string };
    estacionamiento?: { nombre: string } | null;
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
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado';
  referencia?: string | null;
  fecha_pago?: string | null;
  createdAt?: string;
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

export type EstadoReserva = 'solicitada' | 'confirmada' | 'en_proceso' | 'completada' | 'cancelada' | 'no_asistio';

export interface Reserva {
  id: number;
  codigo: string;
  id_cliente: number;
  id_vehiculo: number;
  id_tipo_servicio: number;
  id_estacionamiento?: number | null;
  modalidad: 'expreso' | 'profunda';
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoReserva;
  observaciones?: string | null;
  precio_final?: number | null;
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

export interface Calificacion {
  id: number;
  id_reserva: number;
  id_cliente: number;
  puntuacion: number;
  comentario?: string | null;
  createdAt: string;
}

export interface Plan {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio_mensual: number;
  lavados_incluidos: number;
  modalidad: 'expreso' | 'profunda';
  estado: 'activo' | 'inactivo';
}

export interface Suscripcion {
  id: number;
  id_estacionamiento: number;
  id_plan: number;
  fecha_inicio: string;
  fecha_cancelacion?: string | null;
  estado: 'activa' | 'cancelada';
  plan?: Plan;
  estacionamiento?: { id: number; nombre: string };
  uso_mes_actual?: number;
}
