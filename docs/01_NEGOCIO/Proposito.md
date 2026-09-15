# Proposito y alcance

## Que es

**LavadoCarros** es un sistema de reservas para un servicio de lavado de
vehiculos **a domicilio en el estacionamiento del cliente**. La propuesta, en
palabras de la propia portada del sistema: *"Tu auto limpio mientras esta
estacionado"*.

El cliente reserva en linea, deja el carro donde siempre lo estaciona, y un
lavador va al sitio. Tambien contempla limpieza profunda en bahia.

Fuente: portada publica (`http://127.0.0.1:3041/`) y `IDEA_NEGOCIO.md`.

## Servicios ofrecidos

Segun la portada y la tabla `TipoServicio` (6 registros):

- Expreso Exterior — lavado exterior rapido en el sitio
- Expreso Interior — aspirado, limpieza de tablero y plasticos
- Expreso Completo — exterior + interior

Los tres estan marcados como "EXPRESO · VAMOS AL SITIO".

## Roles

Cuatro roles, definidos en `backend/prisma/schema.prisma` y confirmados con los
usuarios reales de la base de datos:

| Rol | Usuarios reales | Que hace |
|---|---|---|
| `admin` | 1 | administracion completa |
| `operador` | 1 | agenda, asignaciones, validacion de pagos |
| `lavador` | 3 | ve sus trabajos, carga evidencia |
| `cliente` | 6 | reserva, paga, califica |

**Observacion tecnica:** el rol es una **columna de texto libre** con valor por
defecto `"cliente"`, no un `enum` de base de datos. Un valor mal escrito no
seria rechazado por PostgreSQL. Ver hallazgo en el informe de auditoria.

## Volumen de datos real

| Entidad | Registros |
|---|---|
| Usuario | 11 |
| Cliente | 6 |
| Vehiculo | 8 |
| Estacionamiento | 5 |
| Plaza | 42 |
| TipoServicio | 6 |
| Lavador | 3 |
| **Reserva** | **18** |
| AsignacionAgenda | 20 |
| RegistroLavado | 4 |
| Pago | 5 |
| HistorialReserva | 31 |
| Calificacion | 3 |
| Plan | 1 |
| Suscripcion | 1 |

**Lectura:** hay un ciclo de negocio completo recorrido — reservas, asignacion
a lavadores, registro del lavado, pagos y calificaciones. Es un **piloto
funcional con datos coherentes**, no una instalacion vacia. El ultimo commit de
codigo es del 2026-08-31, o sea que lleva **dos semanas sin cambios**.

## Flujo de negocio verificable

Reconstruido desde el modelo de datos y las rutas de la API:

1. El cliente se registra al reservar (`POST /api/public/registrar`).
2. Consulta disponibilidad (`GET /api/reservas/disponibilidad`).
3. Crea la reserva sobre un estacionamiento y una plaza.
4. El operador asigna un lavador (`AsignacionAgenda`).
5. El lavador ejecuta y **sube evidencia fotografica**
   (`POST /api/reservas/:id/evidencia`) — queda en `RegistroLavado`.
6. El cliente paga: tarjeta, o **subiendo un comprobante** que el operador
   valida (`POST /api/pagos/:id/pagos/comprobante`).
7. El cliente **califica** el servicio (`POST /api/reservas/:id/calificacion`).
8. Cada cambio de estado se registra en `HistorialReserva`.

Existe ademas un modelo de **suscripciones** (`Plan` + `Suscripcion`), con 1
plan y 1 suscripcion cargados.

## Lo que NO se pudo determinar

- Si el sistema esta en uso comercial real o sigue en piloto: `NO DETERMINADO`.
  Los datos son coherentes pero pocos, y el codigo lleva dos semanas quieto.
- Quien es el responsable funcional: `NO DETERMINADO`.
- Si los 5 estacionamientos son clientes reales o de prueba: `NO DETERMINADO`.
