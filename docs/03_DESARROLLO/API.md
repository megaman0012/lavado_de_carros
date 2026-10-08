# API

Base: `http://<host>:3042/api`

## Swagger: SI EXISTE

**La API ya publica su propia especificacion interactiva:**

    http://127.0.0.1:3042/api/docs          (interfaz Swagger UI — verificado, HTTP 200)
    http://127.0.0.1:3042/api/docs/swagger.json   (especificacion — verificado, HTTP 200)

**Esa es la fuente autoritativa del detalle de cada endpoint** (parametros,
cuerpos, respuestas). Este documento no la duplica: describe la estructura, la
autenticacion y las advertencias que Swagger no cubre.

> **Hallazgo de seguridad:** Swagger esta accesible **sin autenticacion** y el
> puerto 3042 es alcanzable desde la red local. Ver `05_SEGURIDAD` (SEC-03).

## Autenticacion

Esquema **Bearer JWT**:

    Authorization: Bearer <token>

Desde el **2026-10-08** la sesion son dos piezas:

| Pieza | Duracion | Donde vive | Para que |
|---|---|---|---|
| **Token de acceso** (JWT) | `JWT_EXPIRES_IN`, por defecto **15m** | no se guarda: vale por su firma | va en `Authorization` en cada peticion |
| **Token de refresco** | `REFRESH_EXPIRA_DIAS`, por defecto **7** | tabla `RefreshToken` (solo el SHA-256) | pedir un acceso nuevo sin volver a escribir la contrasena |

El cliente renueva solo: ante un **401** llama a `POST /api/auth/refresh`,
guarda el par nuevo y repite la peticion original. **El refresco rota en cada
uso**; reusar uno ya quemado se interpreta como una copia robada y corta la
sesion entera. Ver `backend/src/services/sesion.service.js`.

Se obtiene con `POST /api/auth/login`. Duracion segun `JWT_EXPIRES_IN`
(el comentario del codigo indica 24 h).

**Particularidad importante:** el middleware no se limita a verificar la firma.
En **cada peticion** consulta la base de datos y rechaza con 401 si:

- el usuario no existe o su `estado` no es `activo`;
- su ficha de `Cliente` no esta activa;
- su ficha de `Lavador` no esta activa.

Mensaje devuelto: `"La cuenta está suspendida"`. Consecuencia practica: **al
suspender a alguien, su acceso se corta de inmediato**, sin esperar a que
caduque el token.

## Autorizacion por rol

`requireRole('admin', 'operador')` restringe por rol. Si no corresponde,
devuelve **403** con `"Acceso denegado. Se requiere rol: X o Y"`.

Roles: `admin`, `operador`, `lavador`, `cliente`.

## Grupos de rutas

Montados en `backend/src/app.js` (hasta el 2026-10-08 vivian en `src/index.js`,
que ahora solo abre el puerto y programa el cron; se separaron para que las
pruebas puedan importar la app sin levantar un servidor):

| Prefijo | Archivo | Contenido |
|---|---|---|
| `/api/auth` | `auth.routes.js` | login, renovacion y cierre de sesion, perfil |
| `/api/public` | `public.routes.js` | registro, servicios y estacionamientos publicos |
| `/api/agenda` | `agenda.routes.js` | agenda, bloqueos, asignacion de lavadores |
| `/api/reservas` | `reserva.routes.js` | reservas, disponibilidad, evidencia, calificacion |
| `/api/clientes` | `cliente.routes.js` | clientes, perfil, reset de usuario |
| `/api/vehiculos` | `vehiculo.routes.js` | vehiculos del cliente |
| `/api/estacionamientos` | `estacionamiento.routes.js` | estacionamientos y plazas |
| `/api/servicios` | `servicio.routes.js` | tipos de servicio |
| `/api/lavadores` | `lavador.routes.js` | lavadores y sus trabajos |
| `/api/reportes` | `reporte.routes.js` | KPIs, ingresos, exportacion Excel y PDF |
| `/api/planes` | `plan.routes.js` | planes y suscripciones |
| `/api/pagos` | `pago.routes.js` | pagos, comprobantes, tarjeta, webhook |
| `/api/recordatorios` | `recordatorio.routes.js` | envio de recordatorios |

## Endpoints destacados

Los que conviene conocer aunque Swagger los detalle:

| Metodo y ruta | Nota |
|---|---|
| `POST /api/auth/login` | limitado por **nombre de usuario**, no solo por IP. Devuelve `token` (15 min) y `refresh_token` (7 dias) |
| `POST /api/auth/refresh` | canjea el `refresh_token` por uno de acceso nuevo. **No lleva `Authorization`**: se llama justo cuando el token vencio. Rota: guardar el `refresh_token` que devuelve, el anterior queda quemado |
| `POST /api/auth/logout` | revoca la sesion en el servidor, no solo en el navegador. Responde 200 siempre |
| `POST /api/public/registrar` | alta publica de cliente; no requiere token |
| `GET /api/reservas/disponibilidad` | franjas libres por estacionamiento y fecha |
| `POST /api/reservas/:id/evidencia` | sube fotos del lavado (multer) |
| `POST /api/pagos/:id/pagos/comprobante` | el cliente sube el comprobante |
| `POST /api/pagos/:id/pagos/tarjeta` | pago con tarjeta |
| `POST /api/pagos/webhook` | **recibe notificaciones externas** — ver advertencia |
| `GET /api/reportes/kpis` | indicadores del panel |
| `GET /api/reportes/exportar/excel` | exportacion a Excel |
| `GET /api/reportes/exportar/pdf` | exportacion a PDF |
| `GET /api/reservas/reserva/:id/acta.pdf` | acta del servicio en PDF |
| `POST /api/clientes/:id/usuario/reset` | reinicio de credenciales del cliente |

> **`POST /api/pagos/webhook`**: es un endpoint que por su naturaleza recibe
> llamadas externas. **No se verifico si valida la firma del emisor.**
> `NO DETERMINADO`. Es la comprobacion mas importante pendiente en esta API:
> un webhook de pagos sin validacion de firma permitiria marcar pagos como
> confirmados desde fuera. Ver recomendacion PEND-01 en el informe.

## Formato de respuesta

Uniforme:

```json
{ "success": true,  "data": ... }
{ "success": false, "message": "texto del error" }
```

## Codigos de estado

| Codigo | Cuando |
|---|---|
| 200 / 201 | correcto |
| 400 | validacion |
| 401 | sin token, token invalido, o **cuenta suspendida** |
| 403 | rol insuficiente |
| 404 | no encontrado |
| **429** | limite de frecuencia superado |
| 500 | error no controlado |

## Limites de frecuencia

Configurados por `RATE_LIMIT_GENERAL` y `RATE_LIMIT_OFF`. Se aplica
`limitadorGeneral` a **todo** `/api`. La clave es el id de usuario cuando hay
sesion, y el nombre de usuario en el login.

## Limites de tamano

| Elemento | Limite | Fuente |
|---|---|---|
| Cuerpo JSON | 20 MB | `express.json({ limit: '20mb' })` |
| Evidencias | 5 MB, **6 archivos** | `backend/src/config/upload.js` |
| Comprobante | 5 MB, **1 archivo** | `backend/src/config/upload.js` |
| Tipos de evidencia | `image/jpeg|png|webp|gif` | filtro por mimetype |
| Tipos de comprobante | los anteriores **+ `application/pdf`** | filtro por mimetype |
