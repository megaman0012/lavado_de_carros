# DOCUMENTACIÓN TÉCNICA - Sistema de Lavado de Carros

**Fecha:** 2026-08-21
**Versión:** MVP 0.1

---

## 1. Requisitos

- Docker + Docker Compose
- Node.js 20+ (solo para desarrollo local sin Docker)
- Puertos libres: **3041** (frontend), **3042** (backend), **5437** (postgres)

---

## 2. Puesta en marcha (Docker)

```bash
cd /home/server-gea/Documentos/lavado_de_carros

# 1. Configurar variables (la primera vez)
cp .env.example .env        # editar si hace falta

# 2. Levantar todo
docker compose up -d --build

# 3. Crear tablas y datos iniciales (primera vez o tras cambiar el schema)
docker compose exec backend npx prisma db push
docker compose exec backend node prisma/seed.js
```

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3041 |
| Backend API | http://localhost:3042/api |
| Swagger | http://localhost:3042/api/docs |
| PostgreSQL | localhost:5437 |

### Comandos útiles

```bash
docker compose logs -f backend      # ver logs del backend
docker compose restart backend      # reiniciar un servicio
docker compose down                 # detener (conserva volumen de datos)
docker compose down -v              # detener Y borrar base de datos
```

---

## 3. Desarrollo local (sin Docker)

### Backend
```bash
cd backend
npm install
# DATABASE_URL apuntando a un Postgres local o al contenedor:
# postgresql://lavado_user:Lavado2026@localhost:5437/lavado_db
npx prisma generate && npx prisma db push
node prisma/seed.js
npm run dev          # nodemon en :3042
```

### Frontend
```bash
cd frontend
npm install
npm start            # CRA en :3000, proxied a /api según package.json
```

---

## 4. Variables de entorno (`.env`)

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `POSTGRES_USER` | `lavado_user` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | `Lavado2026` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | `lavado_db` | Nombre de la BD |
| `DATABASE_URL` | `postgresql://lavado_user:Lavado2026@postgres:5432/lavado_db` | Cadena de conexión (host interno `postgres`) |
| `JWT_SECRET` | (cadena larga aleatoria) | Firma de tokens |
| `JWT_EXPIRES_IN` | `24h` | Expiración del token |
| `PORT` | `3042` | Puerto del backend |
| `NODE_ENV` | `production` | Entorno |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | vacío | Notificaciones por email (creación/confirmación/completado). Vacío = solo se registra en el log, no falla |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN` | vacío | Recordatorios WhatsApp/SMS. Vacío = solo se registra en el log |
| `TWILIO_WHATSAPP_FROM` | vacío | Ej. `whatsapp:+14155238886`. Si está seteado, se prefiere WhatsApp sobre SMS |
| `TWILIO_SMS_FROM` | vacío | Número SMS de origen, si no se usa WhatsApp |

> **Nunca versionar el `.env` real.** Solo `.env.example`.

---

## 5. Autenticación

- `POST /api/auth/registrar` → auto-registro de cliente (crea `Cliente` + `Usuario` rol `cliente`).
- `POST /api/auth/login` → devuelve `{ token, usuario }`.
- Header autorizado: `Authorization: Bearer <token>`.
- Roles: `admin`, `operador`, `lavador`, `cliente`. Endpoints internos exigen rol con `requireRole(...)`.

### Usuarios del seed

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `admin` | `admin123` | admin |
| `operador` | `operador123` | operador |
| `lavador1` | `lavador123` | lavador |

---

## 6. Referencia rápida de API

### Público / cliente
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/public/servicios` | Catálogo activo con precios |
| GET | `/api/public/estacionamientos` | Sitios disponibles |
| GET | `/api/agenda/disponibilidad?fecha=&modalidad=&id_estacionamiento=` | Franjas con cupos restantes |
| POST | `/api/reservas` | Crea reserva y bloquea franja (transacción) |
| GET | `/api/mis-reservas` | Reservas del cliente logueado |
| PUT | `/api/reservas/:id/cancelar` | Cancela (libera franja) |

### Interno (admin/operador)
| Método | Ruta | Descripción |
|--------|------|-------------|
| CRUD | `/api/clientes` · `/api/vehiculos` · `/api/estacionamientos` (+ `/plazas`) · `/api/servicios` · `/api/lavadores` | Catálogos |
| GET | `/api/reservas?fecha=&estado=&modalidad=` | Listado con filtros |
| PUT | `/api/reservas/:id/asignar-lavador` | Asigna/quita lavador (body `{id_lavador}`; `null` quita). Rechaza 409 si el lavador ya tiene franja solapada ese día |
| PUT | `/api/reservas/:id/confirmar` \| `/iniciar` \| `/completar` | Workflow |
| GET | `/api/agenda?fecha=` | Vista agenda del día |
| POST | `/api/agenda/bloqueos` | Bloqueo manual de franja |
| GET | `/api/reportes/kpis` · `/por-servicio` · `/por-estacionamiento` · `/ingresos` | Reportería |
| GET | `/api/reportes/exportar/excel` \| `/pdf` | Descarga el reporte (`?desde=&hasta=`) |
| GET/POST/PUT | `/api/reservas/:id/pagos` · `DELETE /:id/pagos/:pagoId` | Pago manual (efectivo/transferencia; anular solo `admin`) |
| POST | `/api/reservas/:id/pagos/tarjeta` | Inicia pago con tarjeta — agnóstico de pasarela (sin SDK conectado); crea `Pago` `pendiente` |
| POST | `/api/pagos/webhook` | Público — confirma/rechaza el pago anterior por `referencia`; una pasarela real necesita verificación de firma antes de exponerlo |
| GET/POST/PUT | `/api/planes` (+ `/api/planes/:id`) | Catálogo de planes para edificios/condominios (admin) |
| GET/POST/PUT | `/api/planes/suscripciones` (+ `/:id/cancelar`) | Asigna/cancela el plan activo de un estacionamiento |
| POST | `/api/reservas/:id/calificacion` | Cliente califica (1-5 + comentario) una reserva `completada`, una sola vez |
| POST | `/api/recordatorios/enviar` | Dispara manualmente el recordatorio WhatsApp/SMS de las reservas de mañana (además del cron diario 18:00) |

### Evidencia fotográfica
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/reservas/:id/evidencia` | multipart/form-data: `tipo=antes\|despues`, `fotos[]` (máx. 6 × 5 MB, jpg/png/webp/gif). Acumula en `RegistroLavado`; "después" setea `fecha_fin`. Roles: admin/operador/lavador (el lavador solo sus trabajos) |
| GET | `/uploads/...` | Archivos estáticos servidos por Express (volumen Docker `uploads_data`) |

### Formato de respuesta
```json
{ "success": true,  "data": { ... } }
{ "success": false, "message": "Franja no disponible" }
```

---

## 7. Estructura del repositorio

```
lavado_de_carros/
├── ANALISIS.md               # análisis de reutilización del proyecto base
├── IDEA_NEGOCIO.md           # concepto y reglas del negocio
├── ARQUITECTURA.md           # arquitectura técnica
├── MODELO_BASE_DATOS.md      # modelo de datos documentado
├── DOCUMENTACION_TECNICA.md  # este documento
├── HISTORIAL_CHAT.md         # bitácora de sesiones/avances
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── prisma/schema.prisma · seed.js
│   ├── src/ (config, db, middleware, routes, controllers, services)
│   └── Dockerfile
└── frontend/
    ├── src/ (context, components, pages, services, types)
    ├── nginx.conf
    └── Dockerfile
```

---

## 8. Problemas conocidos y soluciones (heredados del proyecto base)

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Backend no arranca en Docker con error de Prisma/OpenSSL | Imagen node slim sin OpenSSL | Ya resuelto: `node:20-slim` + `apt-get install openssl python3 make g++` en el Dockerfile |
| Frontend falla al compilar React 19 en CRA | Incompatibilidad babel | Ya resuelto: `react-app-rewired` + `config-overrides.js` |
| Backend intenta conectar antes de que Postgres esté listo | Orden de arranque | Ya resuelto: healthcheck `pg_isready` + `depends_on: condition: service_healthy` |
| Puerto ocupado al levantar | Otro proyecto usando los puertos | Este proyecto usa 3041/3042/5437; el proyecto base usa 3001/3002/5436 — pueden correr en paralelo |
