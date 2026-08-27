# ANÁLISIS - Sistema de Lavado de Carros

**Base reutilizada:** `/home/server-gea/Documentos/reporteria_tecnica/coordinador-tecnico-mvp02`
**Fecha:** 2026-08-21

---

## 1. Qué es el negocio (resumen de la idea)

- Existen **estacionamientos/sitios** (condominios, edificios, empresas) donde los clientes dejan estacionado su carro.
- El cliente, vía **sitio web** (luego app móvil), ve el estacionamiento y **solicita/reserva** un lavado.
- **5 tipos de servicios EXPRESOS:** la empresa va al sitio y lava el carro sin supervisión del cliente.
- **1 servicio de LIMPIEZA PROFUNDA:** el cliente lleva el carro a un espacio físico específico (bahía), una persona de limpieza lo recibe y trabaja ahí.
- Se necesita **agenda**: ver horarios y **bloquear** los ya reservados (sin doble reserva).
- Se necesita **reportería** (servicios realizados, ingresos, ocupación).
- **Futuro: pagos con tarjeta** (mapear ahora, implementar después).

---

## 2. Análisis del proyecto base (qué tiene)

### Stack
| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express + Prisma ORM + PostgreSQL |
| Auth | JWT + bcryptjs, roles (`admin`, `coordinador`, `tecnico`) |
| Docs API | Swagger (swagger-jsdoc + swagger-ui-express) |
| Logging | Winston |
| Uploads | Multer → `/uploads` |
| Frontend | React 19 + TypeScript (CRA/react-app-rewired) + TailwindCSS + lucide-react + recharts |
| Infra | Docker Compose: nginx (frontend :3001) → Express (:3002) → PostgreSQL (:5436) |

### Patrones que valen la pena copiar
1. **Estructura backend:** `routes/` → `controllers/` → Prisma, con `config/`, `db.js`, `middleware/` (auth + errorHandler centralizado).
2. **Formato de respuesta uniforme:** `{ success: true, data }` / `{ success: false, message }`.
3. **Auth con roles:** middleware `authenticate` + `requireRole(...roles)` — sirve tal cual agregando roles nuevos.
4. **Frontend:** interceptor axios (token + manejo de errores + extracción de `data`), `AuthContext`, `ProtectedRoute`, `Layout` con sidebar por rol, página `Login`.
5. **Dockerización ya resuelta** (los fixes están en BITACORA.md): `node:20-slim` para Prisma/OpenSSL, `config-overrides.js` para babel, `.dockerignore`, healthcheck de Postgres, seed con `prisma.seed` en package.json.
6. **Modelo Agenda/Asignación:** el modelo `Asignacion` (orden ↔ técnico ↔ fecha ↔ hora inicio/fin ↔ estado) es casi exactamente lo que necesitamos para la agenda de lavados.
7. **Dashboard/KPIs + reportería:** patrón de endpoints `/dashboard/kpis` reutilizable.

### Lo que NO se reutiliza (dominio distinto)
- Inventario técnico, jornadas grupales, ausencias/certificaciones, facturación con OC, informes técnicos DT360, importación Excel de órdenes/locales.

---

## 3. Equivalencia de entidades (base → nuevo sistema)

| Proyecto base | Nuevo sistema | Cambio clave |
|---|---|---|
| `Cliente` (empresa/RUC) | `Cliente` (persona: nombre, cédula, teléfono, email) | Pasa a ser usuario web que se auto-registra |
| — | `Vehiculo` (placa, marca, modelo, color, tipo) | **NUEVO** |
| `Local` (local físico) | `Estacionamiento` (sitio con dirección) + `Plaza` (espacio individual) | Adaptado; la plaza permite saber dónde está el carro |
| `Tecnico` | `PersonalLimpieza` (lavador) | Mismo concepto de recurso asignable |
| `Orden` | `Reserva` / `Lavado` (entidad central) | Workflow adaptado al negocio |
| `Asignacion` (orden↔técnico↔fecha/hora) | `AgendaSlot` / asignación de lavador+bahía | Base de la agenda con bloqueo |
| `Servicio` (tipo_trabajo string) | `TipoServicio` (catálogo: 5 expresos + profunda, precio, duración) | Ahora es tabla propia con precio |
| `Factura` | `Pago` (futuro: pasarela de tarjeta) | Simplificado, stub por ahora |
| `InformeTecnico` | `RegistroLavado` (checklist + fotos antes/después) | Adaptado |
| `HistorialOrden` | `HistorialReserva` | Igual |
| Dashboard KPIs | Reportería (lavados, ingresos, ocupación) | Igual patrón |

---

## 4. Modelo de dominio propuesto (schema Prisma)

```prisma
// Roles: admin, operador, lavador, cliente
model Usuario {
  id          Int      @id @default(autoincrement())
  username    String   @unique            // para clientes: su email
  password    String                      // null si solo es OAuth futuro
  rol         String   @default("cliente")
  id_cliente  Int?     @unique
  estado      String   @default("activo")
  createdAt   DateTime @default(now())
  cliente     Cliente? @relation(fields: [id_cliente], references: [id])
}

model Cliente {
  id        Int       @id @default(autoincrement())
  nombre    String
  cedula    String?   @unique
  telefono  String?
  email     String?   @unique
  estado    String    @default("activo")
  createdAt DateTime  @default(now())
  vehiculos Vehiculo[]
  reservas  Reserva[]
  usuario   Usuario?
}

model Vehiculo {
  id         Int     @id @default(autoincrement())
  id_cliente Int
  placa      String  @unique
  marca      String?
  modelo     String?
  color      String?
  tipo       String? // sedan, suv, camioneta, moto
  estado     String  @default("activo")
  cliente    Cliente @relation(fields: [id_cliente], references: [id])
  reservas   Reserva[]
  @@index([id_cliente])
}

// Sitio donde el cliente deja el carro (edificio, condominio, empresa)
model Estacionamiento {
  id          Int     @id @default(autoincrement())
  nombre      String
  direccion   String?
  ciudad      String?
  contacto    String?
  horario_apertura String? @default("07:00")
  horario_cierre   String? @default("18:00")
  admite_expreso   Boolean @default(true)
  estado      String  @default("activo")
  plazas      Plaza[]
  reservas    Reserva[]
  @@index([ciudad])
}

// Espacio individual dentro del estacionamiento (opcional, fase 2)
model Plaza {
  id                 Int     @id @default(autoincrement())
  id_estacionamiento Int
  codigo             String  // "P-01", "P-02"...
  tipo               String  @default("estacionamiento") // estacionamiento | bahia_lavado
  estado             String  @default("disponible") // disponible | ocupada | mantenimiento
  estacionamiento    Estacionamiento @relation(fields: [id_estacionamiento], references: [id])
  reservas           Reserva[]
  @@unique([id_estacionamiento, codigo])
}

// Catálogo: 5 expresos + limpieza profunda
model TipoServicio {
  id            Int     @id @default(autoincrement())
  nombre        String  // "Expreso Básico", "Expreso Premium", ..., "Limpieza Profunda"
  descripcion   String?
  modalidad     String  // expreso (vamos al sitio) | profunda (cliente trae el carro)
  duracion_min  Int     @default(60)
  precio        Float   @default(0)
  activo        Boolean @default(true)
  orden_display Int     @default(0)
  reservas      Reserva[]
}

// Personal de limpieza
model Lavador {
  id         Int     @id @default(autoincrement())
  nombre     String
  cedula     String? @unique
  telefono   String?
  estado     String  @default("activo")
  usuario    Usuario?
  asignaciones AsignacionAgenda[]
}

// ENTIDAD CENTRAL
// Estados: solicitada → confirmada → en_proceso → completada | cancelada | no_asistio
model Reserva {
  id                Int      @id @default(autoincrement())
  codigo            String   @unique // RES-2026-0001
  id_cliente        Int
  id_vehiculo       Int
  id_tipo_servicio  Int
  id_estacionamiento Int?
  id_plaza          Int?     // dónde está el carro (expreso) o bahía asignada (profunda)
  modalidad         String   // expreso | profunda (copia del tipo de servicio)
  fecha             DateTime // día
  hora_inicio       String   // "09:00"
  hora_fin          String   // "10:30"
  estado            String   @default("solicitada")
  observaciones     String?
  precio_final      Float?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  cliente        Cliente        @relation(fields: [id_cliente], references: [id])
  vehiculo       Vehiculo       @relation(fields: [id_vehiculo], references: [id])
  tipoServicio   TipoServicio   @relation(fields: [id_tipo_servicio], references: [id])
  estacionamiento Estacionamiento? @relation(fields: [id_estacionamiento], references: [id])
  plaza          Plaza?         @relation(fields: [id_plaza], references: [id])
  asignaciones   AsignacionAgenda[]
  registro       RegistroLavado?
  pagos          Pago[]
  historial      HistorialReserva[]

  @@index([fecha])
  @@index([estado])
  @@index([id_cliente])
  @@index([id_estacionamiento])
}

// AGENDA: ocupa franja + recurso. La unicidad evita doble reserva.
model AsignacionAgenda {
  id          Int      @id @default(autoincrement())
  id_reserva  Int
  id_lavador  Int?
  fecha       DateTime
  hora_inicio String
  hora_fin    String
  estado      String   @default("pendiente") // pendiente | en_proceso | completado | cancelado
  reserva     Reserva  @relation(fields: [id_reserva], references: [id])
  lavador     Lavador? @relation(fields: [id_lavador], references: [id])
  @@index([fecha])
  @@index([id_lavador])
}

// Evidencia del trabajo (reemplaza InformeTecnico)
model RegistroLavado {
  id            Int      @id @default(autoincrement())
  id_reserva    Int      @unique
  checklist     Json?    // items marcados
  fotos_antes   String?  // JSON array URLs
  fotos_despues String?
  observaciones String?
  fecha_fin     DateTime?
  createdAt     DateTime @default(now())
  reserva       Reserva  @relation(fields: [id_reserva], references: [id])
}

// MAPEO PARA PAGOS FUTUROS (no se implementa aún)
model Pago {
  id            Int      @id @default(autoincrement())
  id_reserva    Int
  monto         Float
  metodo        String   @default("efectivo") // efectivo | transferencia | tarjeta
  estado        String   @default("pendiente") // pendiente | aprobado | rechazado | reembolsado
  referencia    String?  // id de transacción de la pasarela (futuro)
  fecha_pago    DateTime?
  createdAt     DateTime @default(now())
  reserva       Reserva  @relation(fields: [id_reserva], references: [id])
  @@index([estado])
}

model HistorialReserva {
  id              Int      @id @default(autoincrement())
  id_reserva      Int
  accion          String
  estado_anterior String?
  estado_nuevo    String?
  motivo          String?
  usuario         String?
  fecha_cambio    DateTime @default(now())
  reserva         Reserva  @relation(fields: [id_reserva], references: [id])
  @@index([id_reserva])
}
```

---

## 5. Mecánica de la agenda (reglas de bloqueo)

**Servicios EXPRESOS (en el sitio):**
- El cliente elige estacionamiento + fecha + franja horaria.
- Disponibilidad = capacidad de lavadores activos × duración del servicio dentro del horario del sitio.
- Al confirmar reserva se crea `AsignacionAgenda`; la franja queda **bloqueada** (endpoint de disponibilidad descuenta las ocupadas).

**Limpieza PROFUNDA (bahía física):**
- Capacidad limitada por bahías (`Plaza.tipo = 'bahia_lavado'`). Ej.: 2 bahías → máximo 2 reservas simultáneas en la misma franja.
- El endpoint `/api/agenda/disponibilidad?fecha=...&modalidad=profunda` devuelve las franjas con cupos restantes; cupo 0 = bloqueado en la UI.

**Regla anti doble-reserva:** transacción Prisma al crear la reserva verificando solapamiento (`fecha + hora` contra `AsignacionAgenda` existentes y bahías ocupadas). Índice único lógico por (bahía, fecha, hora_inicio).

---

## 6. API propuesta

```
PÚBLICO (cliente web)
POST   /api/auth/registrar          # auto-registro de cliente
POST   /api/auth/login
GET    /api/public/servicios        # catálogo activo con precios
GET    /api/public/estacionamientos
GET    /api/agenda/disponibilidad?fecha&modalidad&id_estacionamiento
POST   /api/reservas                # crea reserva + bloquea franja (transacción)
GET    /api/mis-reservas            # historial del cliente logueado
PUT    /api/reservas/:id/cancelar

INTERNO (admin/operador/lavador — JWT + requireRole)
CRUD   /api/clientes, /api/vehiculos, /api/estacionamientos (+plazas)
CRUD   /api/servicios               # catálogo con precios
GET    /api/reservas?fecha&estado&modalidad
PUT    /api/reservas/:id/confirmar | /iniciar | /completar | /cancelar
GET    /api/agenda?fecha            # vista calendario del día/semana
POST   /api/agenda/bloqueos         # bloqueo manual de franja (mantenimiento, etc.)
CRUD   /api/lavadores
POST   /api/archivos                # fotos antes/después (multer, ya existe patrón)

REPORTERÍA
GET    /api/reportes/kpis           # lavados hoy/semana/mes, ingresos, % ocupación
GET    /api/reportes/por-servicio   # ranking tipos de servicio
GET    /api/reportes/por-estacionamiento
GET    /api/reportes/ingresos?desde&hasta

FUTURO (stub)
POST   /api/pagos/intentar-tarjeta # placeholder pasarela (Stripe/MercadoPago)
```

---

## 7. Frontend propuesto

Reutilizar: `api.ts` (interceptores), `AuthContext`, `ProtectedRoute`, `Layout` (sidebar por rol), `Login`, setup Tailwind + lucide-react, componentes de tabla/modal.

**Portal público (sin login o login de cliente):**
- Landing con catálogo de servicios (cards con precio/duración).
- Flujo de reserva: elegir servicio → estacionamiento (expreso) → vehículo (o registrarlo) → calendario con franjas disponibles (ocupadas bloqueadas/grises) → confirmar.
- "Mis reservas": lista con estados y botón cancelar.

**Panel interno (roles admin/operador/lavador):**
- **Agenda** (pantalla clave): calendario semanal/diario con franjas; verde = libre, azul = reservado, rojo = bloqueado manual.
- Reservas: tabla con filtros y cambio de estado (workflow).
- Catálogos: servicios, estacionamientos/plazas, lavadores, clientes/vehículos.
- Reportes: KPIs + gráficos (recharts ya está en el stack).
- Configuración: usuarios y roles.

---

## 8. Pagos con tarjeta (mapeo para fase posterior)

- El modelo `Pago` ya contempla `metodo=tarjeta`, `referencia` (id de transacción) y estados.
- Integración recomendada: **Stripe** o **MercadoPago** (según país). Flujo:
  1. Cliente crea reserva → estado `solicitada` con pago `pendiente`.
  2. Webhook de la pasarela confirma → `Pago.estado=aprobado` → reserva pasa a `confirmada`.
  3. Si falla/reembolso → liberar franja de agenda.
- Solo requiere: agregar SDK de la pasarela + endpoint webhook + pantalla de checkout. La estructura actual no cambia.

---

## 9. Plan por fases

| Fase | Alcance |
|---|---|
| **1 - MVP** | Scaffold desde el proyecto base (Docker, auth+roles, CRUD catálogos), flujo completo de reserva con agenda y bloqueo de franjas, panel interno básico, reportería básica (KPIs). |
| **2 - Operación** | RegistroLavado con fotos, notificaciones (email/WhatsApp), bloqueos manuales, reportería avanzada (Excel/PDF). |
| **3 - Pagos** | Pasarela de tarjeta (Stripe/MercadoPago), checkout web, webhooks, reembolsos. |
| **4 - App móvil** | React Native / PWA consumiendo la misma API. |

---

## 10. Infraestructura (puertos confirmados)

| Servicio | Base | Nuevo |
|---|---|---|
| Frontend (nginx) | 3001 | **3041** |
| Backend (Express) | 3002 | **3042** |
| PostgreSQL | 5436 | **5437** |

Mismo docker-compose (3 servicios), mismos Dockerfiles ya probados (node:20-slim + openssl, multi-stage frontend), mismo nginx.conf con proxy `/api`.

---

## 11. Conclusión

Se puede reutilizar **~70% del esqueleto** (infra Docker, auth, patrones de API, layout frontend, patrón de agenda/asignaciones) sin tocar el proyecto original. El trabajo nuevo real es: modelo de dominio de lavados, lógica de disponibilidad/bloqueo de franjas, portal público de reservas y reportería del negocio.
