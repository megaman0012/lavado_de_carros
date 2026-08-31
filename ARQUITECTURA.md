# ARQUITECTURA - Sistema de Lavado de Carros

**Fecha:** 2026-08-21
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
│   ├── index.js             # servidor Express (CORS, rutas, swagger, errorHandler)
│   ├── config/index.js      # variables de entorno centralizadas
│   ├── db.js                # instancia única de PrismaClient
│   ├── middleware/
│   │   ├── auth.js          # authenticate + requireRole(...roles)
│   │   └── errorHandler.js  # manejo centralizado de errores
│   ├── routes/              # auth, clientes, vehiculos, estacionamientos,
│   │                        # servicios, lavadores, reservas, agenda, reportes, pagos
│   ├── controllers/         # lógica HTTP; usa transacciones Prisma para reservas
│   ├── services/            # lógica de negocio pura (disponibilidad, workflow)
│   ├── utils/
│   │   ├── credenciales.js  # contraseñas provisionales legibles + hash
│   │   ├── firmaArchivos.js # firma/valida las URLs de /uploads
│   │   └── logger.js
│   └── swagger.js           # documentación OpenAPI
├── Dockerfile
├── package.json
└── .dockerignore
```

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
│   ├── context/AuthContext.tsx      # login/logout/token/usuario
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
│   │   ├── Reportes.tsx             # KPIs + gráficos
│   │   └── Dashboard.tsx
│   ├── services/api.ts              # axios + interceptores (token, errores)
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
- JWT firmado (`JWT_SECRET`), expiración 24h, enviado como `Authorization: Bearer`.
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

---

## 7. Escalabilidad prevista

| Necesidad futura | Cambio requerido |
|---|---|
| Pagos con tarjeta | SDK pasarela + webhook `/api/pagos/webhook`; modelo `Pago` ya existe |
| App móvil | Misma API REST; solo nuevo cliente |
| Notificaciones | Servicio worker (email/WhatsApp) suscrito a cambios de estado de Reserva |
| Multi-ciudad | Ya modelado (`Estacionamiento.ciudad`) |
| Alta concurrencia en agenda | Migrar verificación a constraint único en BD (bahía+fecha+franja) o advisory locks |
