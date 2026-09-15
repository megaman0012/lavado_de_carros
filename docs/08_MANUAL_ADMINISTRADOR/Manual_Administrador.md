# Manual de administrador

Version 1.0 · 2026-09-15

## 1. Usuarios y roles

Cuatro roles: `admin`, `operador`, `lavador`, `cliente`. Distribucion real:
6 clientes, 3 lavadores, 1 operador, 1 admin.

| Rol | Alcance |
|---|---|
| `admin` | administracion completa |
| `operador` | agenda, asignaciones, validacion de pagos |
| `lavador` | sus trabajos y carga de evidencia |
| `cliente` | sus reservas, pagos y calificaciones |

**Suspender una cuenta corta el acceso de inmediato.** El sistema revalida el
estado en cada peticion, asi que no hay que esperar a que caduque el token.
Basta poner `estado` distinto de `activo` en `Usuario`, o en la ficha de
`Cliente` o `Lavador`.

**Advertencia:** el rol es texto libre en la base. Al crear usuarios **por
fuera de la aplicacion**, un valor mal escrito (`"Admin"` en vez de `"admin"`)
deja la cuenta sin permisos, sin mensaje de error. Usar siempre minusculas y
exactamente uno de los cuatro valores.

Existe `POST /api/clientes/:id/usuario/reset` para reiniciar credenciales de un
cliente.

## 2. Catalogos

| Catalogo | Entidad | Registros |
|---|---|---|
| Servicios | `TipoServicio` | 6 |
| Estacionamientos | `Estacionamiento` | 5 |
| Plazas | `Plaza` | 42 |
| Planes | `Plan` | 1 |

## 3. Agenda

- Asignar lavador: `PUT /api/agenda/asignaciones/:id/lavador`
- Bloquear franjas: `POST /api/agenda/bloqueos` y `DELETE /api/agenda/bloqueos/:id`

Las franjas bloqueadas dejan de ofrecerse al cliente.

## 4. Validacion de pagos

Los comprobantes que sube el cliente quedan **por validar**. Se listan con
`GET /api/pagos/pendientes` y el operador los aprueba o rechaza.

> Al momento de la auditoria, la **pasarela de tarjeta no esta conectada**.
> Antes de conectarla, leer SEC-02: el webhook no valida firma y eso debe
> resolverse primero.

## 5. Reportes

| Reporte | Endpoint |
|---|---|
| KPIs | `GET /api/reportes/kpis` |
| Ingresos | `GET /api/reportes/ingresos` |
| Por estacionamiento | `GET /api/reportes/por-estacionamiento` |
| Por servicio | `GET /api/reportes/por-servicio` |
| Exportar Excel | `GET /api/reportes/exportar/excel` |
| Exportar PDF | `GET /api/reportes/exportar/pdf` |
| Acta de servicio | `GET /api/reservas/reserva/:id/acta.pdf` |

## 6. Parametros del sistema

Todo en `.env` (requiere reiniciar el backend tras cambiarlo):

| Variable | Efecto |
|---|---|
| `JWT_EXPIRES_IN` | duracion de la sesion |
| `RATE_LIMIT_GENERAL` | limite de peticiones general |
| `RATE_LIMIT_OFF` | desactiva los limites |
| `SMTP_*` | envio de correo |
| `TWILIO_*` | WhatsApp y SMS |

> **`RATE_LIMIT_OFF` desactiva la proteccion contra fuerza bruta.** Usarlo
> solo en pruebas y nunca dejarlo activo en produccion.

## 7. Mantenimiento

- **Base de datos:** PostgreSQL 15 con autovacuum por defecto. Sin tareas
  manuales para este volumen.
- **Archivos subidos:** el volumen `uploads_data` **crece sin limite**. No hay
  politica de purga. Con 4 registros de lavado hoy no es problema; conviene
  definir retencion antes de que escale.

## 8. Respaldos y recuperacion

Ver `12_CONTINUIDAD/Backup_Recuperacion.md`. **Hoy no hay respaldo
automatico**; es la recomendacion mas urgente junto con SEC-01.

## 9. Monitoreo y logs

    docker compose ps
    curl -s http://127.0.0.1:3042/api/health
    docker compose logs -f backend

Sin monitoreo automatico. El backend no tiene healthcheck.
