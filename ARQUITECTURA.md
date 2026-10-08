# ARQUITECTURA - Sistema de Lavado de Carros

**Fecha:** 2026-08-21 · actualizado 2026-10-08 (pruebas, helmet, refresh token, CI)
**Base:** arquitectura del proyecto `coordinador-tecnico-mvp02` (dockerización probada, ver BITACORA de ese proyecto)

---

## 1. Visión general

```
┌──────────────┐      /api (proxy)     ┌──────────────┐      Prisma      ┌──────────────┐
│   Frontend   │ ────────────────────► │   Backend    │ ───────────────► │  PostgreSQL  │
│ React + TS   │                       │ Express + JWT│                  │  Postgres 15 │
│ nginx :3041  │                       │    :3042     │                  │    :5437     │
└──────────────┘                       └──────────────┘                  └──────────────┘
```

- **Frontend:** SPA React 19 + TypeScript servida por nginx. Todo lo que no sea `/api` cae a `index.html` (SPA routing).
- **Backend:** API REST Express con JWT, roles, Swagger, Winston logging y uploads Multer.
- **Base de datos:** PostgreSQL 15 vía Prisma ORM.

---

## 2. Contenedores Docker

| Servicio | Imagen | Puerto externo → interno | Notas |
|----------|--------|--------------------------|-------|
| `frontend` | multi-stage: node:20-alpine (build CRA) → nginx:alpine | **3041 → 80** | nginx hace proxy de `/api/` al backend |
| `backend` | node:20-slim (+ openssl para Prisma) | **3042 → 3042** | `npx prisma generate` en el build |
| `postgres` | postgres:15-alpine | **5437 → 5432** | healthcheck `pg_isready`, volumen `postgres_data` |

Orden de arranque: `postgres (healthy)` → `backend` → `frontend`.

### Fixes heredados del proyecto base (ya probados)
1. `node:20-slim` + instalación de `openssl python3 make g++` para que Prisma funcione.
2. Frontend con `react-app-rewired` + `config-overrides.js` (compatibilidad babel con React 19).
3. `.dockerignore` en backend y frontend para builds limpios.
4. Healthcheck de Postgres como condición de arranque del backend.

---

## 3. Estructura del backend

```
backend/
├── prisma/
│   ├── schema.prisma        # dominio lavado
│   └── seed.js              # admin + servicios + estacionamientos demo
├── src/
│   ├── app.js               # la app Express (helmet, CORS, rutas, swagger, errorHandler)
│   ├── index.js             # arranque: abre el puerto y programa el cron
│   ├── config/index.js      # variables de entorno centralizadas
│   ├── db.js                # instancia única de PrismaClient
│   ├── middleware/
│   │   ├── auth.js          # authenticate + requireRole(...roles)
│   │   └── errorHandler.js  # manejo centralizado de errores
│   ├── routes/              # auth, clientes, vehiculos, estacionamientos,
│   │                        # servicios, lavadores, reservas, agenda, reportes, pagos
│   ├── controllers/         # lógica HTTP; usa transacciones Prisma para reservas
│   ├── services/            # lógica de negocio pura (disponibilidad, cotización,
│   │                        # sesión/refresh token, notificaciones)
│   ├── utils/
│   │   ├── credenciales.js  # contraseñas provisionales legibles + hash
│   │   ├── firmaArchivos.js # firma/valida las URLs de /uploads
│   │   └── logger.js
│   └── swagger.js           # documentación OpenAPI
├── tests/
│   ├── entorno.js           # variables de las pruebas; impide tocar la base real
│   ├── ayudas/              # app sin servidor, sembrado y limpieza de la BD
│   ├── unitarios/           # sin base de datos (fechas, agenda, cotización, firmas)
│   └── integracion/         # la API con supertest contra PostgreSQL de pruebas
├── jest.config.js
├── Dockerfile
├── package.json
└── .dockerignore
```

**`app.js` y `index.js` están separados a propósito.** `app.js` solo arma la
aplicación y la exporta; `index.js` es el que abre el puerto y programa el cron
de recordatorios. Así supertest importa la app sin levantar un servidor real ni
disparar envíos: antes, `require('./index')` escuchaba en el 3042 y dejaba
procesos vivos que colgaban a Jest.

### Convenciones (heredadas)
- Respuesta uniforme: `{ success: true, data }` / `{ success: false, message }`.
- Rutas protegidas con `authenticate` y `requireRole('admin','operador')`.
- Errores capturados por el middleware central (nunca `process.exit`).

---

## 4. Estructura del frontend

```
frontend/
├── src/
│   ├── index.tsx / App.tsx          # router + providers
│   ├── context/AuthContext.tsx      # login/logout (revoca en el servidor)/usuario
│   ├── components/
│   │   ├── Layout.tsx               # sidebar por rol
│   │   └── ProtectedRoute.tsx       # guarda de rutas
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Landing.tsx              # catálogo público de servicios
│   │   ├── Reservar.tsx             # flujo de reserva (cliente)
│   │   ├── MisReservas.tsx          # historial del cliente
│   │   ├── Agenda.tsx               # calendario con franjas bloqueadas
│   │   ├── Reservas.tsx             # gestión interna (workflow estados)
│   │   ├── Catalogos.tsx            # servicios, estacionamientos, lavadores...
│   │   └── Reportes.tsx             # KPIs + gráficos; con prop `resumen` es el Dashboard
│   ├── services/api.ts              # axios + interceptores: token, renovación
│   │                                # automática del acceso vencido, errores
│   └── types/index.ts               # interfaces TypeScript
├── nginx.conf                       # try_files SPA + proxy /api/
├── Dockerfile                       # build multi-stage
└── package.json
```

---

## 5. Flujo clave: creación de reserva (transacción anti doble-reserva)

```
POST /api/reservas
  1. Validar datos (servicio activo, vehículo del cliente, fecha futura).
  2. BEGIN TRANSACTION:
     a. Contar asignaciones que se solapen con [hora_inicio, hora_fin) ese día:
        - expresa: en el estacionamiento elegido (capacidad = lavadores activos)
        - profunda: bahías ocupadas (capacidad = total de bahías)
     b. Si ocupación >= capacidad → ROLLBACK → 409 "Franja no disponible".
     c. INSERT Reserva (estado=solicitada) + AsignacionAgenda + HistorialReserva.
  3. COMMIT → devolver reserva creada.
```

La verificación dentro de la transacción elimina la condición de carrera entre dos reservas simultáneas.

---

## 6. Seguridad

- Contraseñas con `bcryptjs` (hash + salt).
- JWT firmado (`JWT_SECRET`), enviado como `Authorization: Bearer`. Dura 15 minutos;
  la sesión larga la sostiene el refresh token (más abajo).
- `authenticate` revalida en cada request que la cuenta y su ficha (Cliente/Lavador) sigan
  activas: suspender a alguien tiene efecto inmediato, no al vencer su token.
- Roles validados en cada endpoint sensible (`requireRole`).
- El cliente solo accede a sus propias reservas/vehículos (filtro por `id_cliente` del token).
- Credenciales solo por `.env` (no versionadas); `.env.example` como plantilla.
- Suspender un cliente o lavador desde el panel sincroniza el `Usuario`: la ficha y el
  acceso caen juntos. Nada se borra (las reservas históricas los referencian).
- **Archivos subidos** (evidencia fotográfica, comprobantes de transferencia): `/uploads`
  no es estático abierto. La API entrega cada ruta firmada (`?exp=&sig=`, HMAC con
  `JWT_SECRET`, vigencia 8h) y el middleware `verificarFirma` la valida. Se firma la URL en
  vez de exigir el header `Authorization` porque estas rutas se consumen desde
  `<img src="...">`, donde el navegador no lo manda. Ver `utils/firmaArchivos.js`.
- Contraseñas provisionales (alta de cliente en sitio, cuenta de lavador): se generan
  legibles, se devuelven **una sola vez** en la respuesta y en BD queda solo el hash.
  Restablecer una contraseña **revoca todas las sesiones abiertas** con la anterior.
- **Cabeceras de seguridad** (`helmet`, desde 2026-10-08), con tres desvíos del
  default razonados en `app.js`: el CSP afloja estilos y scripts inline porque
  Swagger UI los necesita (el HTML de la aplicación lo sirve nginx, no la API);
  `crossOriginResourcePolicy: cross-origin` porque las fotos de `/uploads` se
  muestran con `<img src>` desde la APK, que corre en otro origen; y HSTS queda
  apagado mientras el despliegue sea HTTP.
- **Sesión en dos piezas** (`services/sesion.service.js`, desde 2026-10-08):
  - *Token de acceso*: el JWT, 15 minutos, no se guarda — vale por su firma.
  - *Token de refresco*: 48 bytes aleatorios, 7 días, en la tabla `RefreshToken`
    y **solo como SHA-256**. Rota en cada uso; si llega uno ya revocado hay dos
    copias dando vueltas y se corta la *familia* entera.

  Antes el token duraba 24 h y no había forma de anularlo: cerrar sesión solo lo
  borraba del navegador propio. El cliente renueva solo ante un 401 y repite la
  petición, así que el usuario no nota el cambio.
- **Rate limiting** (`middleware/rateLimit.middleware.js`): techo general de 300 req/5 min
  más límites propios en login (10 fallidos/15 min), registro, subidas de archivos,
  comprobantes del cliente, exportaciones y webhook. Donde hay sesión la clave es el
  **id de usuario** y no la IP: la IP se puede falsear con un `X-Forwarded-For` en una
  llamada directa al 3042, y además una oficina con NAT compartiría un solo cupo. El login
  se limita por nombre de usuario. `app.set('trust proxy', 1)` — un solo salto (nginx).
  Store en memoria: sirve para una instancia; con réplicas haría falta Redis.

---

## 7. Pruebas y CI

| Qué | Dónde | Cuándo corre |
|---|---|---|
| 184 pruebas (unitarias + integración) | `backend/tests/` | `npm test`; en cada push y PR |
| Tipos y build del frontend | — | en cada push y PR |
| Build de las dos imágenes Docker | — | en cada push y PR |

El pipeline está en `.github/workflows/ci.yml` y el despliegue en
`scripts/desplegar.sh`. Detalle en `docs/16_CI_CD/CI_CD.md`.

Las pruebas de integración corren contra un **PostgreSQL real**, no contra
dobles: la regla que más importa —que una franja no se venda dos veces— depende
de una transacción serializable, y eso solo lo verifica un motor de verdad. Hay
un caso que dispara dos reservas en paralelo por el último cupo y exige un 201,
un 409 y una sola fila en la tabla.

## 8. Escalabilidad prevista

| Necesidad futura | Cambio requerido |
|---|---|
| Pagos con tarjeta | SDK pasarela + webhook `/api/pagos/webhook`; modelo `Pago` ya existe |
| App móvil | Misma API REST; solo nuevo cliente |
| Notificaciones | Servicio worker (email/WhatsApp) suscrito a cambios de estado de Reserva |
| Multi-ciudad | Ya modelado (`Estacionamiento.ciudad`) |
| Alta concurrencia en agenda | Migrar verificación a constraint único en BD (bahía+fecha+franja) o advisory locks |
