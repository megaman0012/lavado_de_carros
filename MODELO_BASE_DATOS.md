# MODELO BASE DE DATOS - Sistema de Lavado de Carros

**Fecha:** 2026-08-21
**Motor:** PostgreSQL 15 (vía Prisma ORM)
**Fuente de verdad:** `backend/prisma/schema.prisma`

---

## 1. Diagrama lógico (relaciones principales)

```
Usuario 1──0..1 Cliente 1──* Vehiculo
Usuario 1──0..1 Lavador 1──* AsignacionAgenda *──1 Reserva
Estacionamiento 1──* Plaza 1──* Reserva (opcional)
Estacionamiento 1──* Reserva (opcional)
TipoServicio 1──* Reserva *──1 RegistroLavado (1─0..1)
Reserva 1──* Pago
Reserva 1──* HistorialReserva
```

---

## 2. Entidades

### 2.1 Usuarios y clientes

| Entidad | Propósito | Campos clave |
|---------|-----------|--------------|
| `Usuario` | Credenciales de acceso (todos los roles) | `username` (email para clientes), `password` (bcrypt), `rol` (`admin`\|`operador`\|`lavador`\|`cliente`), `id_cliente?`, `id_lavador?`, `estado` |
| `Cliente` | Persona dueña del vehículo | `nombre`, `cededula?`, `telefono?`, `email?` |
| `Vehiculo` | Auto del cliente | `placa` (única), `marca`, `modelo`, `color`, `tipo` |

> Un `Usuario` con rol `cliente` se vincula 1–1 a un `Cliente`; uno con rol `lavador` se vincula a un `Lavador`.

### 2.2 Sitios y espacios

| Entidad | Propósito | Campos clave |
|---------|-----------|--------------|
| `Estacionamiento` | Edificio/condominio/empresa donde se deja el carro | `nombre`, `direccion`, `ciudad`, `horario_apertura/cierre`, `admite_expreso` |
| `Plaza` | Espacio individual dentro del sitio | `codigo` ("P-01"), `tipo` (`estacionamiento`\|`bahia_lavado`), `estado` |

> Las **bahías de lavado** son plazas con `tipo='bahia_lavado'`: definen la capacidad máxima simultánea de servicios de limpieza profunda.

### 2.3 Catálogo de servicios

`TipoServicio`: `nombre`, `descripcion`, `modalidad` (`expreso`\|`profunda`), `duracion_min`, `precio`, `activo`, `orden_display`.

Seed inicial: 5 expresos + Limpieza Profunda.

### 2.4 Personal

`Lavador`: `nombre`, `cedula?`, `telefono?`, `estado`. Es el recurso asignable de la agenda expresa.

### 2.5 Núcleo operativo

#### `Reserva` (entidad central)

| Campo | Tipo | Nota |
|-------|------|------|
| `codigo` | String único | Formato `RES-2026-00001` |
| `id_cliente`, `id_vehiculo`, `id_tipo_servicio` | FK | Obligatorios |
| `id_estacionamiento?`, `id_plaza?` | FK | Expreso: dónde está el carro / Profunda: bahía asignada |
| `modalidad` | String | Copia de la modalidad del servicio (inmutable al precio histórico) |
| `fecha` | DateTime | Día del servicio |
| `hora_inicio`, `hora_fin` | String "HH:mm" | Franja reservada |
| `estado` | String | `solicitada → confirmada → en_proceso → completada` \| `cancelada` \| `no_asistio` |
| `precio_final` | Float? | Se fija al confirmar; default = precio del servicio |

Índices: `fecha`, `estado`, `id_cliente`, `id_estacionamiento`.

#### `AsignacionAgenda` (bloqueo de franja)

| Campo | Nota |
|-------|------|
| `id_reserva` FK | Reserva que ocupa la franja |
| `id_lavador?` FK | Lavador asignado (puede asignarse después) |
| `fecha`, `hora_inicio`, `hora_fin` | Franja ocupada |
| `estado` | `pendiente \| en_proceso \| completado \| cancelado` |

Cada fila = franja ocupada. La disponibilidad se calcula contando filas solapadas vs capacidad.

#### `RegistroLavado` (evidencia, 1–0..1 con Reserva)

`checklist` (JSON), `fotos_antes`, `fotos_despues` (URLs), `observaciones`, `fecha_fin`.

#### `Pago` (mapeo para pasarela futura)

`monto`, `metodo` (`efectivo`\|`transferencia`\|`tarjeta`), `estado` (`pendiente`\|`aprobado`\|`rechazado`\|`reembolsado`), `referencia` (id transacción pasarela), `fecha_pago`.

#### `HistorialReserva` (auditoría)

`accion`, `estado_anterior`, `estado_nuevo`, `motivo`, `usuario`, `fecha_cambio`.

---

## 3. Reglas de integridad

1. **Anti doble-reserva:** verificación de solapamiento dentro de una transacción Prisma al crear la reserva (ver ARQUITECTURA §5).
2. **Unicidad:** `Vehiculo.placa`, `Cliente.cedula/email`, `Usuario.username`, `Reserva.codigo`.
3. **Consistencia de estados:** los cambios de estado solo por endpoints del workflow (`confirmar/iniciar/completar/cancelar`), cada uno registra en `HistorialReserva`.
4. **Borrado lógico:** entidades maestras usan `estado` (`activo/inactivo`) en lugar de DELETE físico.
5. **Cancelación libera agenda:** al cancelar una reserva su `AsignacionAgenda` pasa a `cancelado` y deja de contar para la ocupación.

---

## 4. Convenciones

- IDs: `Int autoincrement`.
- Fechas: `DateTime` para días; horas como `String "HH:mm"` (franjas simples, sin zonas horarias).
- Auditoría básica: `createdAt` (+ `updatedAt` en Reserva).
- Nombres en español coherentes con el dominio del negocio.
