# HISTORIAL DE CHAT - Bitácora de Avances

**Proyecto:** Sistema de Lavado de Carros
**Carpeta:** `/home/server-gea/Documentos/lavado_de_carros`
**Proyecto base:** `/home/server-gea/Documentos/reporteria_tecnica/coordinador-tecnico-mvp02`

> Este archivo registra cada sesión de trabajo: qué se pidió, qué se hizo y cuál es el siguiente paso. **Actualizarlo al final de cada sesión.**

---

## Sesión 1 — 2026-08-21

### Solicitudes del usuario
1. Usar `coordinador-tecnico-mvp02` como base para un nuevo sistema de **lavado de carros** en la carpeta `lavado_de_carros`.
2. Mecánica del negocio:
   - Estacionamientos donde el cliente deja su carro.
   - Reserva vía web (luego app) para lavados.
   - 5 servicios **expresos** (vamos al sitio, sin supervisión del cliente).
   - 1 servicio de **limpieza profunda** (cliente lleva el carro a una bahía, personal lo recibe).
   - **Agenda** con visualización y bloqueo de horarios ya reservados.
   - **Reportería**.
   - Mapear (no implementar aún) **pagos con tarjeta**.

### Decisiones tomadas
- Reutilizar ~70% del proyecto base: infra Docker probada, auth JWT+roles, patrones de API, layout frontend, patrón agenda/asignaciones.
- Equivalencias: Local→Estacionamiento(+Plaza), Tecnico→Lavador, Orden→Reserva, Factura→Pago(stub), InformeTecnico→RegistroLavado.
- Roles nuevos: `admin`, `operador`, `lavador`, `cliente` (auto-registro web).
- **Puertos confirmados por el usuario: 3041 (frontend), 3042 (backend), 5437 (postgres).**

### Trabajo realizado
- [x] `ANALISIS.md` — análisis completo de reutilización + modelo propuesto + API propuesta.
- [x] `IDEA_NEGOCIO.md` — concepto, mecánica, catálogo de servicios, reglas, roadmap comercial.
- [x] `ARQUITECTURA.md` — arquitectura técnica, contenedores, flujo anti doble-reserva.
- [x] `MODELO_BASE_DATOS.md` — modelo de datos documentado.
- [x] `DOCUMENTACION_TECNICA.md` — instalación, variables, referencia API, troubleshooting.
- [x] `HISTORIAL_CHAT.md` — este archivo.

### Pendiente / siguientes pasos
- [x] Scaffold backend (estructura, config, db, middleware auth+roles).
- [x] `prisma/schema.prisma` del dominio lavado + seed (admin, 5 expresos + profunda, estacionamientos demo).
- [x] Módulo reservas + agenda con bloqueo anti doble-reserva (transacción).
- [x] Reportería básica (KPIs).
- [x] Docker: docker-compose + Dockerfiles + nginx.conf con puertos 3041/3042/5437.
- [x] Scaffold frontend: api.ts, AuthContext, ProtectedRoute, Layout, Login, Landing, flujo Reservar, MisReservas, Agenda, Reservas, catálogos, Reportes.
- [x] Probar levantamiento completo con Docker.

### Notas
- El proyecto base queda intacto; todo se copia/adapta a esta carpeta.
- Pagos con tarjeta: solo mapeo en el modelo (`Pago.metodo/referencia/estado`); implementación en Fase 3.

---

## Sesión 2 — 2026-08-21

### Solicitudes del usuario
1. Usar puertos **3041** (frontend), **3042** (backend), **5437** (postgres).
2. Crear los documentos técnicos correspondientes.
3. Crear archivo de historial de chat para guardar avances.
4. Crear documento con la idea de negocio.
5. Hacer todo paso a paso.

### Trabajo realizado
- [x] Documentación completa (Sesión 1): IDEA_NEGOCIO, ARQUITECTURA, MODELO_BASE_DATOS, DOCUMENTACION_TECNICA, HISTORIAL_CHAT.
- [x] **Backend completo** (`backend/`):
  - Express en :3042, CORS, Winston logging, Swagger en `/api/docs`, health check.
  - Auth JWT + roles (`admin|operador|lavador|cliente`) con auto-registro público de clientes.
  - Módulo de reservas con **transacción anti doble-reserva** (verifica solapamiento vs capacidad dentro de `prisma.$transaction`).
  - Agenda: disponibilidad por franjas (expreso = lavadores activos; profunda = bahías), vista del día, bloqueos manuales con liberación.
  - Workflow de estados: `solicitada → confirmada → en_proceso → completada | cancelada | no_asistio` con auditoría en `HistorialReserva`; cancelar/no_asistio libera la franja.
  - CRUDs: clientes, vehículos, estacionamientos+plazas (incluye bahías), servicios (precios/duraciones editables), lavadores (+asignación de lavador a franja).
  - Reportes: KPIs, por-servicio, por-estacionamiento, serie de ingresos.
  - Endpoints públicos sin auth: catálogo de servicios y estacionamientos.
- [x] **Schema Prisma** completo (Usuario, Cliente, Vehiculo, Estacionamiento, Plaza, TipoServicio, Lavador, Reserva, AsignacionAgenda, RegistroLavado, Pago stub, HistorialReserva). Fix aplicado: relaciones Usuario↔Cliente/Lavador explícitas.
- [x] **Seed**: admin/admin123, operador/operador123, lavador1..3/lavador123, 6 servicios (5 expresos + Limpieza Profunda $55/180min), 3 estacionamientos demo con plazas + taller con 2 bahías.
- [x] **Frontend completo** (`frontend/`):
  - React 19 + TS + Tailwind + lucide-react + recharts, build con react-app-rewired (fix babel heredado).
  - Landing pública con catálogo y precios; Login; flujo de reserva en 4 pasos (servicio → lugar → vehículo → fecha/franja con bloqueo visual de ocupadas).
  - Panel interno: Dashboard/KPIs, Agenda del día con bloqueos manuales, gestión de Reservas con workflow, catálogos (Clientes, Estacionamientos, Servicios, Lavadores), Reportes con gráficos.
  - Layout con sidebar filtrado por rol; ProtectedRoute con roles; interceptores axios (token + extracción `{success,data}` + redirect 401).
- [x] **Docker** levantado y verificado: nginx :3041 → backend :3042 → postgres :5437.

### Verificación end-to-end (curl contra http://localhost:3041)
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Health vía proxy nginx | ✅ ok |
| 2 | Login admin (JWT) | ✅ |
| 3 | Auto-registro de cliente | ✅ crea Cliente+Usuario |
| 4 | Catálogo público (6 servicios) | ✅ |
| 5 | Registro de vehículo del cliente | ✅ |
| 6 | Disponibilidad expreso (capacidad=3 lavadores) | ✅ franjas con cupos |
| 7 | 3 reservas expreso misma franja | ✅ RES-2026-00001..3 |
| 8 | 4ª reserva misma franja | ✅ **HTTP 409 rechazada** |
| 9 | Franja 09:00 queda BLOQUEADA (cupos=0) | ✅ |
| 10 | Reserva profunda en bahía (08:00–11:00) | ✅ |
| 11 | Workflow confirmar→iniciar→completar | ✅ |
| 12 | Cancelar libera cupo (0→1) | ✅ |
| 13 | KPIs reportería | ✅ |
| 14 | Bloqueo manual afecta ambas modalidades | ✅ |
| 15 | Mis-reservas solo del cliente logueado | ✅ |

### Estado actual
- Sistema MVP funcional de punta a punta corriendo en Docker (puertos 3041/3042/5437).
- Frontend compila sin errores TypeScript (`npm run build` OK).

### Pendiente / siguientes pasos sugeridos
- [ ] Asignación de lavadores desde la UI de agenda (endpoint ya existe).
- [ ] RegistroLavado con checklist y fotos antes/después (modelo listo, falta UI + multer).
- [ ] Gestión de usuarios interna (crear operadores/lavadores con usuario).
- [ ] Notificaciones por email/WhatsApp al cambiar estado de reserva.
- [ ] Fase 3: pasarela de pagos con tarjeta (Stripe/MercadoPago).

### Notas
- El proyecto base queda intacto; todo se copia/adapta a esta carpeta.
- Pagos con tarjeta: solo mapeo en el modelo (`Pago.metodo/referencia/estado`); implementación en Fase 3.
- Los bloqueos manuales (`AsignacionAgenda.id_reserva=null`) bloquean expreso Y profunda en su franja.

---

## Sesión 3 — 2026-08-21

### Solicitudes del usuario
1. "ok por ahora esta bien continua" → continuar con los siguientes pasos sugeridos: **asignación de lavadores desde la UI** y **evidencia fotográfica del lavado**.

### Trabajo realizado
- [x] **Backend — asignación de lavador por reserva**:
  - `PUT /api/reservas/:id/asignar-lavador` (admin/operador): asigna o quita (`id_lavador: null`) el lavador de las franjas de agenda de la reserva.
  - Validación **anti doble-asignación**: rechaza con HTTP 409 si el lavador ya tiene otra franja solapada el mismo día (excluyendo la propia reserva).
  - Solo en estados `solicitada | confirmada | en_proceso`; registra `asignar_lavador`/`quitar_lavador` en `HistorialReserva` dentro de transacción.
- [x] **Backend — evidencia fotográfica**:
  - `src/config/upload.js`: multer con almacenamiento en `uploads/evidencias/reserva-{id}/`, máx. 6 imágenes × 5 MB, solo jpg/png/webp/gif.
  - `POST /api/reservas/:id/evidencia` (admin/operador/lavador): campo `tipo=antes|despues`; **acumula** sobre las fotos existentes en `RegistroLavado`; al subir "después" por primera vez setea `fecha_fin`.
  - El rol `lavador` solo puede subir evidencia de trabajos que tiene asignados (HTTP 403 si no).
  - Servido estático en `/uploads`; wrapper en la ruta convierte errores de multer en HTTP 400 legible (antes devolvía 500).
- [x] **Docker**: volumen persistente `uploads_data:/app/uploads` para que las fotos sobrevivan a rebuilds.
- [x] **Frontend — Reservas.tsx**:
  - Nueva columna "Lavador" con los nombres asignados por reserva.
  - Botón "Asignar lavador" (UserPlus) → modal con select de lavadores activos, opción de quitar asignación y muestra de errores 409.
  - Botón "Evidencia" (Camera) para estados `en_proceso|completada` → modal con pestañas Antes/Después, subida múltiple y galería con vista ampliada.
  - Tipos: agregado `RegistroLavado` y `registro?` a `Reserva`.

### Verificación end-to-end (curl contra http://localhost:3042)
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Asignar Carlos Pérez a RES-3 (09:00–09:30) | ✅ |
| 2 | Mismo lavador en RES-4 (08:00–11:00, solapa) | ✅ **HTTP 409 rechazada** |
| 3 | Luis Gómez en RES-4 | ✅ |
| 4 | Subir foto ANTES a RES-3 | ✅ acumula en `fotos_antes` |
| 5 | Subir foto DESPUÉS a RES-3 | ✅ + `fecha_fin` automático |
| 6 | GET estático `/uploads/evidencias/...png` vía nginx :3041 | ✅ HTTP 200 image/png |
| 7 | Rechazo de archivo no-imagen | ✅ HTTP 400 con mensaje claro |
| 8 | Historial audita `asignar_lavador` | ✅ |
| 9 | Persistencia de fotos en volumen tras rebuild | ✅ |

### Estado actual
- Sistema MVP funcional + asignación de lavadores + evidencia fotográfica, corriendo en Docker (3041/3042/5437).
- TypeScript compila sin errores; contenedores reconstruidos y verificados.

### Pendiente / siguientes pasos sugeridos
- [ ] Vista "Mis trabajos" para el rol lavador (ver sus asignaciones y subir evidencia desde su sesión).
- [ ] Checklist de limpieza configurable en RegistroLavado (modelo listo).
- [ ] Evidencia visible para el cliente en MisReservas (los datos ya vienen en el detalle).
- [ ] Gestión de usuarios interna (crear operadores/lavadores con usuario).
- [ ] Notificaciones por email/WhatsApp al cambiar estado de reserva.
- [ ] Fase 3: pasarela de pagos con tarjeta (Stripe/MercadoPago).

### Notas
- El proyecto base queda intacto; todo se copia/adapta a esta carpeta.
- Pagos con tarjeta: solo mapeo en el modelo (`Pago.metodo/referencia/estado`); implementación en Fase 3.
- Los bloqueos manuales (`AsignacionAgenda.id_reserva=null`) bloquean expreso Y profunda en su franja.

---

## Sesión 4 — 2026-08-22

### Solicitudes del usuario
1. Analizar el proyecto para continuar con tareas pendientes.
2. Ejecutar en orden los ítems P0 del plan: #1 (Vista "Mis trabajos") y #2 (evidencia visible para el cliente).

### Trabajo realizado
- [x] **P0#1 — Vista "Mis trabajos" (lavador)**:
  - Backend: `GET /api/reservas/mis-trabajos` (filtra reservas por `id_lavador` del token, opcional `?fecha=`).
  - Backend: restricción de acceso agregada para rol `lavador` en `GET /reservas/:id` y en `iniciar/completar` (antes cualquier lavador autenticado podía ver/operar reservas ajenas; solo `asignar-lavador` y `evidencia` ya lo validaban).
  - Frontend: página `MisTrabajos.tsx` (tarjetas con datos del trabajo, botones Iniciar/Completar y modal de evidencia antes/después), ruta `/mis-trabajos` (rol `lavador`), ítem de menú en `Layout.tsx`.
  - Fix: `Login.tsx` redirigía siempre a `/dashboard` (solo accesible admin/operador) sin importar el rol — un lavador o cliente recién logueado caía en "Acceso denegado". Ahora redirige según rol (`cliente`→`/mis-reservas`, `lavador`→`/mis-trabajos`, resto→`/dashboard`); mismo criterio aplicado al logo del sidebar en `Layout.tsx`.
- [x] **P0#2 — Cliente ve evidencia en MisReservas**:
  - Frontend: modal de galería antes/después (solo lectura) en `MisReservas.tsx`, botón "Evidencia" visible en estados `en_proceso|completada`. Sin cambios de backend (el endpoint `mis-reservas` ya incluía `registro`).
- [x] **Bug crítico encontrado y corregido**: `frontend/nginx.conf` no tenía regla para `/uploads/`, por lo que toda foto de evidencia (existente y nueva) devolvía el `index.html` de la SPA en vez de la imagen al pedirse por el puerto público 3041 — aunque el backend sí la servía bien en 3042. Se agregó `location /uploads/ { proxy_pass http://backend:3042/uploads/; ... }`. Esto afectaba también la funcionalidad de evidencia de la Sesión 3 (el "✅" registrado en esa bitácora para la prueba estática fue probado contra el backend directo, no contra nginx).

### Verificación end-to-end (curl + build)
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | `npx tsc --noEmit` frontend | ✅ sin errores |
| 2 | Login lavador1 → `GET /reservas/mis-trabajos` | ✅ devuelve solo sus reservas asignadas |
| 3 | Lavador intenta ver/iniciar reserva ajena | ✅ HTTP 403 |
| 4 | Cliente crea reserva → admin confirma+asigna lavador → lavador inicia → sube evidencia antes/después → completa | ✅ flujo completo |
| 5 | Cliente ve `registro` con ambas fotos en `GET /mis-reservas` | ✅ |
| 6 | Foto de evidencia vía `http://localhost:3041/uploads/...` (nginx) antes del fix | ❌ HTTP 200 `text/html` (servía index.html) |
| 7 | Mismo request después del fix de nginx | ✅ HTTP 200 `image/png` |

- [x] **P0#3 — Detalle de reserva para cliente**:
  - Frontend: modal `ModalDetalle` en `MisReservas.tsx` (botón "Detalle" en cada tarjeta), consume `GET /reservas/:id` (ya devolvía `historial` y `asignaciones.lavador`, no requirió cambios de backend). Muestra estado actual, lavador asignado y línea de tiempo del historial (acción, fecha, motivo) con etiquetas en español.
  - Frontend: agregado `HistorialReserva` a `types/index.ts` y campo `historial?` a `Reserva`.

- [x] **P0#4 — Franjas horarias/capacidad configurables por estacionamiento**:
  - Se descubrió que `agenda.service.js` **ya** leía `Estacionamiento.capacidad_expreso` y `duracion_franja_min` (campos que ya existían en `schema.prisma`), pero: (a) el CRUD de estacionamientos no los aceptaba al crear/editar, (b) no había ninguna UI para editarlos, y (c) **la base de datos real no tenía esas columnas** — el schema.prisma se había actualizado pero nunca se corrió `prisma db push` contra la BD viva (`P2022: column does not exist`). Los tres se corrigieron:
  - Backend: `db push` ejecutado contra la BD para sincronizar columnas faltantes; `estacionamiento.controller.js` (`crear`/`actualizar`) ahora acepta `capacidad_expreso` y `duracion_franja_min`.
  - Frontend: `Estacionamientos.tsx` — formulario de creación con los dos campos nuevos, y nuevo modal "Configurar agenda" (ícono ⚙) por sitio para editar horario, granularidad de franja, capacidad expreso, `admite_expreso` y estado de cualquier sitio ya existente (antes no había forma de editar un sitio creado, solo de crearlo). Tipos actualizados en `types/index.ts`.

### Verificación P0#4
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Crear estacionamiento con `capacidad_expreso=2`, `duracion_franja_min=30`, horario 08:00–12:00 | ✅ |
| 2 | `GET /agenda/disponibilidad` en ese sitio devuelve franjas cada 30 min con `capacidad=2` | ✅ |
| 3 | `PUT /estacionamientos/:id` cambia capacidad a 5 y granularidad a 60 en un sitio existente | ✅ persistido |
| 4 | Sitio de prueba desactivado al finalizar | ✅ |

- [x] **P1#7 — Registro de pago manual (efectivo/transferencia)**:
  - Backend: nuevo `pago.controller.js` — `POST /api/reservas/:id/pagos` (admin/operador) crea un `Pago` con `estado='aprobado'` (metodo restringido a `efectivo|transferencia`; `tarjeta` queda reservado para la pasarela de Fase 3), valida monto > 0 y que la reserva no esté `cancelada|no_asistio`, y registra `registrar_pago` en `HistorialReserva`. `DELETE /api/reservas/:id/pagos/:pagoId` (solo `admin`) anula un pago mal registrado (`estado='rechazado'`, no se borra — se mantiene el rastro contable) y registra `anular_pago`.
  - Rutas agregadas a `reserva.routes.js` (mismo patrón que evidencia/asignar-lavador).
  - Frontend: modal "Pagos" (ícono billetera) en `Reservas.tsx` — muestra total/pagado/saldo, lista de pagos con botón de anular (solo visible para `admin`), y formulario para registrar nuevos pagos (prellena el monto con el saldo pendiente). Badge de estado de pago (✓ pagado / pagado $X / sin pagar) en la tabla de reservas.
  - Frontend: `MisReservas.tsx` — el modal de Detalle del cliente ahora también muestra "Pagado $X de $Y" (dato que ya viajaba en la respuesta). Tipos `Pago` agregados a `types/index.ts`.
  - Nota: el KPI `ingresos_mes` en `reporte.controller.js` **ya sumaba desde la tabla `Pago`** (`estado='aprobado'`) desde la sesión 1, pero como no existía forma de crear pagos, ese KPI siempre había estado en $0 en la práctica. Con esto queda funcional.

### Verificación P1#7
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Pago parcial ($5 de $8) → saldo $3 | ✅ |
| 2 | Método `tarjeta` en el registro manual | ✅ HTTP 400 rechazado |
| 3 | Completar el saldo con transferencia + referencia → saldo $0 | ✅ |
| 4 | `GET /reportes/kpis` → `ingresos_mes` sube con los pagos aprobados | ✅ ($8) |
| 5 | Admin anula un pago → `ingresos_mes` baja correspondientemente | ✅ ($5) |
| 6 | Operador intenta anular un pago | ✅ HTTP 403 (solo admin) |
| 7 | Historial visible para lavador y cliente incluye `registrar_pago`/`anular_pago` | ✅ |

- [x] **P1#5 — Notificaciones por email (creación, confirmación, completado)**:
  - Backend: `nodemailer` agregado. `src/services/mail.service.js` (`enviarCorreo`) — si `SMTP_HOST` no está configurado en `.env`, el correo **no falla el flujo**: solo se registra en el log con destinatario y asunto (para poder verificar en desarrollo sin credenciales reales). `src/services/notificacion.service.js` con las 3 plantillas (`notificarCreacion`, `notificarConfirmacion`, `notificarCompletado`).
  - Conectado en `reserva.controller.js`: `crear` → `notificarCreacion`; `cambiarEstado` → `notificarConfirmacion` cuando `nuevoEstado==='confirmada'` y `notificarCompletado` cuando `==='completada'`.
  - Variables `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` agregadas a `.env`, `.env.example` (con ejemplo de Gmail) y `docker-compose.yml`. **Vacías por defecto** — el usuario debe completarlas con credenciales SMTP reales (Gmail con contraseña de aplicación, SendGrid, etc.) para que se envíen correos de verdad; mientras tanto el sistema funciona igual, solo sin enviar.
  - Se corrigió de paso un detalle: `logger.warn/info('label', 'detalle')` en `utils/logger.js` descarta el segundo argumento (`printf` solo destructura `message`) — es un problema preexistente en todo el proyecto, no se tocó `logger.js`; en `mail.service.js` se pasa un solo string ya combinado para que el log de "correo omitido" sea legible.
- [x] **P1#6 — Reportería exportable Excel/PDF**:
  - Backend: `exceljs` y `pdfkit` agregados. `reporte.controller.js` refactorizado — la lógica de cálculo (`calcularKPIs`, `calcularPorServicio`, `calcularPorEstacionamiento`, `calcularIngresos`) ahora es compartida entre los endpoints JSON existentes y los nuevos `GET /api/reportes/exportar/excel` y `GET /api/reportes/exportar/pdf` (admin/operador, acepta `?desde=&hasta=`).
  - Excel: 4 hojas (Resumen, Por servicio, Por estacionamiento, Ingresos por día) con encabezados con estilo.
  - PDF: resumen de una página con KPIs y tablas de servicio/estacionamiento (vía `pdfkit`, sin dependencias de Chromium).
  - Frontend: botones "Excel"/"PDF" en `Reportes.tsx` — descarga autenticada vía `axios` (`responseType: 'blob'`) + link temporal, ya que el navegador no puede adjuntar el JWT a un `<a href>` directo.

### Verificación P1#5 y P1#6
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Crear reserva sin SMTP configurado | ✅ no falla; log: `Mail: SMTP no configurado — se omite envío a ... "Reserva RES-... recibida"` |
| 2 | Confirmar → iniciar → completar (mismo flujo) | ✅ log de confirmación y completado, sin bloquear la respuesta HTTP |
| 3 | `GET /reportes/exportar/excel` | ✅ `Content-Type` xlsx válido, 4 hojas con datos reales (verificado con `openpyxl`) |
| 4 | `GET /reportes/exportar/pdf` | ✅ PDF válido de 1 página con KPIs y tablas |

- [x] **P1#8 — Gestión de plazas ocupadas / mapeo visual del estacionamiento**:
  - El CRUD de plazas (`listarPlazas`/`crearPlaza`/`actualizarPlaza`) ya existía en el backend desde la sesión 1, pero sin ninguna UI que lo consumiera. Se encontró y corrigió un bug: la ruta `GET /estacionamientos/:id/plazas` ignoraba el parámetro de ruta `:id` y esperaba `id_estacionamiento` como query param — así que llamarla con el id del sitio en la URL devolvía **todas** las plazas de todos los sitios sin filtrar. Corregido en `estacionamiento.controller.js` (`listarPlazas` ahora prioriza `req.params.id`).
  - Frontend: nuevo modal "Mapa de plazas" (ícono de grilla) en `Estacionamientos.tsx` — grilla visual de plazas separada por tipo (estacionamiento / bahía de lavado), coloreada por estado (verde=disponible, rojo=ocupada, gris=mantenimiento); clic en una plaza rota su estado; formulario para agregar plazas nuevas (código + tipo). Tipo `Plaza` agregado a `types/index.ts`.
  - No se agregó borrado de plazas (no existía endpoint DELETE en el backend y no se pidió); el ciclo de estados cubre el caso de uso real (marcar mantenimiento/ocupación manual).

### Verificación P1#8
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | `GET /estacionamientos/1/plazas` devuelve solo las 10 plazas del sitio 1 (antes del fix devolvía todas) | ✅ |
| 2 | Crear bahía nueva → ciclo disponible→ocupada→mantenimiento vía `PUT` | ✅ |
| 3 | Código de plaza duplicado en el mismo sitio | ✅ HTTP 409 |
| 4 | Poner una bahía en mantenimiento reduce en 1 la `capacidad` que devuelve `GET /agenda/disponibilidad?modalidad=profunda` | ✅ (3→2) — confirma que el mapa de plazas está realmente conectado a la lógica de agenda, no es solo cosmético |

### Estado actual (fin de la sesión, antes de P2)
- Backend y frontend reconstruidos y corriendo en Docker (3041/3042/5437); BD sincronizada con `schema.prisma` (`prisma db push`).
- Los 4 ítems P0 y los 4 ítems P1 del `PLAN_TRABAJO.md` están completos (✅).

---

## P2 completo — 2026-08-22 (misma sesión)

### Solicitud del usuario
"Haz todo el P2" — los 5 ítems: pagos con tarjeta, planes/suscripciones, calificaciones, WhatsApp/SMS, PWA.

### Decisiones tomadas con el usuario (antes de empezar)
Como #9 y #12 requieren cuentas reales de terceros que no puedo crear por el usuario, se preguntó explícitamente:
- **Pagos con tarjeta**: "Solo dejar el código listo, sin conectar ninguna pasarela." → se implementó agnóstico de proveedor (sin SDK de Stripe/MercadoPago).
- **WhatsApp/SMS**: "Usa el mismo patrón que el email." → Twilio con fallback a log si no hay credenciales.
- **Planes/suscripciones**: "Propón una estructura razonable." → se diseñó un modelo simple basado en lo que ya dice `IDEA_NEGOCIO.md` ("planes mensuales para edificios/empresas, lavados incluidos").

### Trabajo realizado

**#13 — PWA instalable** (autocontenido, sin dependencias externas):
- `frontend/public/manifest.json` + íconos generados (`icon-192.png`, `icon-512.png`, gota azul sobre círculo sky-600, con Pillow).
- `frontend/public/service-worker.js`: escrito a mano (sin Workbox) — cache-first para estáticos propios, siempre red para `/api/` y `/uploads/` (evidencia y datos nunca deben quedar obsoletos en caché).
- `frontend/src/serviceWorkerRegistration.ts` + registro en `index.tsx` (solo en producción).
- `nginx.conf`: `location = /service-worker.js` con `Cache-Control: no-cache` (evita que quede pegado un SW viejo).
- Nota para el usuario: para que el navegador ofrezca "instalar" de verdad se necesita HTTPS en producción (localhost/LAN por HTTP alcanza solo para pruebas).

**#11 — Calificaciones/reseñas post-lavado**:
- Modelo `Calificacion` (1-1 con `Reserva`): `puntuacion` 1-5, `comentario` opcional.
- `POST /api/reservas/:id/calificacion` (cliente, dueño de la reserva, solo si `estado='completada'`, una sola vez — 409 si repite).
- `calificacion_promedio` y `calificaciones_total` agregados a `GET /reportes/kpis` (y a las exportaciones Excel/PDF).
- Frontend: `MisReservas.tsx` — botón de estrellas para calificar reservas completadas; una vez calificada, muestra las estrellas ya puestas (solo lectura). Tarjeta de "Calificación promedio" agregada a `Reportes.tsx`.

**#10 — Planes/suscripciones para condominios**:
- Diseño: el plan se contrata **por estacionamiento** (edificio/condominio), no por cliente individual — cubre N lavados expreso al mes **compartidos** entre todos los residentes que reservan ahí. Coincide con `IDEA_NEGOCIO.md`. No incluye cobro recurrente automático (eso depende de #9, que quedó sin pasarela conectada); la administración del condominio se factura aparte, manualmente, por ahora.
- Modelos `Plan` (catálogo, admin) y `Suscripcion` (1 activa por estacionamiento; `id_suscripcion` agregado a `Reserva`).
- `reserva.controller.js` (`crear`): dentro de la misma transacción anti-doble-reserva, si el estacionamiento tiene una suscripción activa para esa modalidad y todavía hay cupo ese mes, el `precio_final` de la reserva es **0** y queda enlazada a la suscripción; si no hay cupo, se cobra normal. El conteo de uso se hace dentro de la transacción (evita condición de carrera con dos reservas simultáneas agotando el cupo).
- Backend: `plan.controller.js`/`plan.routes.js` — CRUD de planes (admin), asignar/cancelar suscripción a un estacionamiento (admin/operador; rechaza con 409 si ese sitio ya tiene una activa).
- Frontend: nueva página `Planes.tsx` (nav "Planes") — crear/activar/desactivar planes, asignar plan a un estacionamiento con barra de uso del mes, cancelar suscripción. Badge del plan activo agregado a las tarjetas de `Estacionamientos.tsx`.

**#9 — Pagos con tarjeta (código listo, sin pasarela conectada)**:
- `pago.controller.js`: `iniciarTarjeta` (`POST /reservas/:id/pagos/tarjeta`) crea un `Pago{metodo:'tarjeta', estado:'pendiente', referencia: 'PEND-...'}' por el saldo pendiente de la reserva. `webhook` (`POST /api/pagos/webhook`, **sin auth** — así llamaría una pasarela real con su propia verificación de firma) confirma o rechaza ese pago por su `referencia`.
- Nada de esto llama a un SDK de Stripe/MercadoPago; es la interfaz/contrato listo para conectar uno cuando el usuario tenga cuenta. `ModalPago` en `Reservas.tsx` muestra una nota indicando que la pasarela no está conectada (no se agregó un botón que no haga nada real).

**#12 — Recordatorios WhatsApp/SMS (Twilio, mismo patrón "seguro por defecto" que el email)**:
- `sms.service.js`: si `TWILIO_ACCOUNT_SID` no está en `.env`, el mensaje solo se registra en el log (no falla). Prefiere WhatsApp (`TWILIO_WHATSAPP_FROM`) si está configurado; si no, cae a SMS (`TWILIO_SMS_FROM`).
- `recordatorio.service.js`: busca reservas de "mañana" en estado `solicitada|confirmada` con `cliente.telefono`, y envía un recordatorio — **idempotente** (revisa que no exista ya un `HistorialReserva.accion='recordatorio_enviado'` para esa reserva antes de reenviar).
- Cron diario a las 18:00 (`node-cron`, en `index.js`) + `POST /api/recordatorios/enviar` (admin/operador) para disparo manual/pruebas sin esperar al cron.
- Variables `TWILIO_*` agregadas a `.env`, `.env.example` y `docker-compose.yml` (vacías por defecto).

### Verificación end-to-end
| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | `manifest.json` / `service-worker.js` / íconos servidos vía nginx | ✅ HTTP 200, tipos correctos |
| 2 | Crear plan, asignarlo a un estacionamiento, asignar de nuevo (ya activo) | ✅ / ✅ HTTP 409 |
| 3 | 2 reservas expreso en ese sitio → gratis (cupo del plan); 3ra reserva → cobro normal | ✅ (`precio_final` 0, 0, 8) |
| 4 | `GET /planes/suscripciones` refleja `uso_mes_actual: 2/2` | ✅ |
| 5 | Calificar reserva completada (5★ + comentario); calificar de nuevo; puntuación inválida (9) | ✅ / ✅ 409 / ✅ 400 |
| 6 | `calificacion_promedio` en KPIs | ✅ (5) |
| 7 | Iniciar pago con tarjeta → `estado=pendiente`; webhook aprobado → pago pasa a `aprobado`; webhook repetido | ✅ / ✅ / ✅ 400 |
| 8 | Recordatorio manual: cliente sin teléfono (omitido) vs. cliente con teléfono (mensaje armado y logueado); segundo disparo no reenvía | ✅ |

### Estado actual
- Backend y frontend reconstruidos y corriendo en Docker (3041/3042/5437); BD sincronizada (`Plan`, `Suscripcion`, `Calificacion`, `Reserva.id_suscripcion` agregados vía `prisma db push`).
- **Los 4 ítems P0, los 4 P1 y los 5 P2 del `PLAN_TRABAJO.md` están completos.** Lo único pendiente en todo el roadmap es P3 (tests automatizados, seguridad dura, CI/CD, backups).

### Pendiente de acción del usuario (credenciales reales)
- `SMTP_HOST/USER/PASS` en `.env` → activar envío real de emails (hoy solo log).
- `TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM` o `SMS_FROM` en `.env` → activar WhatsApp/SMS real (hoy solo log).
- Elegir e integrar Stripe o MercadoPago (SDK + claves) para que `iniciarTarjeta`/`webhook` dejen de ser un contrato agnóstico y cobren de verdad.
- En producción, servir el sitio por HTTPS para que la PWA sea instalable desde el navegador.

### Notas
- Detalle de timezone observado (no corregido, no pedido en esta sesión): el contenedor backend corre en UTC; el negocio opera aparentemente en UTC-5. Esto puede desalinear en ~5 horas los cortes de "día" (KPI "hoy", vista de agenda del día, límite de mes de las suscripciones) cerca de la medianoche local. Si se vuelve un problema real, se soluciona fijando `TZ` en el contenedor backend o normalizando fechas explícitamente contra la zona del negocio.
- El proyecto base queda intacto; todo se copia/adapta a esta carpeta.
- Los bloqueos manuales (`AsignacionAgenda.id_reserva=null`) bloquean expreso Y profunda en su franja.
- [ ] Nota operativa: el usuario del sistema (`server-gea`) no pertenecía al grupo `docker` ni tenía permisos de escritura sobre los archivos del proyecto (quedaron con dueño `root` de una sesión anterior); se corrigió con `chown -R` y `usermod -aG docker`.

### Notas
- El proyecto base queda intacto; todo se copia/adapta a esta carpeta.
- Pagos con tarjeta: solo mapeo en el modelo (`Pago.metodo/referencia/estado`); implementación en Fase 3.
- Los bloqueos manuales (`AsignacionAgenda.id_reserva=null`) bloquean expreso Y profunda en su franja.

---

---

## Sesión 5 — 2026-08-31

**Pedido del usuario:** commitear los cambios que estaban sin subir y regenerar datos de ayer / hoy / mañana como punto de partida para una presentación del servicio.

### Commits creados
| Commit | Contenido |
|---|---|
| `550e9ad` | Registro de cliente en línea en el paso 3 de `Reservar.tsx` (con login automático, en vez de mandar a `/login` y perder el avance) + aviso cuando la sesión activa no es de rol cliente. `Landing.tsx`: se oculta el precio en las tarjetas, queda solo la duración. |
| `e86b382` | `backend/prisma/seed-demo.js` (estaba sin trackear): 5 clientes ficticios con vehículos y 12 reservas en ayer/hoy/mañana. |
| `1e9dce7` | `limpiarDemoAnterior()` en el seed de demo — lo hace re-ejecutable. |

**Push pendiente:** el remoto es `https://github.com/megaman0012/lavado_de_carros.git`; la máquina no tiene `gh` ni credential helper, así que los 3 commits quedaron **solo locales** (`main` adelante 3 de `origin/main`). Requiere que el usuario autentique.

### Seed de demo re-ejecutable
Problema encontrado: la siembra anterior corrió el 2026-08-28, así que sus "ayer/hoy/mañana" eran 27/28/29 — al 31 de agosto todos los registros estaban vencidos (reservas `confirmada`/`solicitada` con fecha pasada, que es justo lo que no se quiere mostrar en una demo).

Solución: `limpiarDemoAnterior()` borra las reservas de la corrida previa —identificadas por `HistorialReserva.usuario = 'seed-demo'`— y sus hijos en orden (`Calificacion` → `RegistroLavado` → `Pago` → `AsignacionAgenda` → `HistorialReserva` → `Reserva`), porque el schema **no** tiene `onDelete: Cascade`. Los clientes y vehículos ficticios se reutilizan (ya eran idempotentes por `email`/`placa`). Las reservas creadas por clientes reales desde la app no se tocan.

Uso antes de cada presentación:
```bash
docker exec -w /app lavado_de_carros-backend-1 node prisma/seed-demo.js
```

### Datos sembrados (verificados en BD y por API)
- 12 reservas: 4 el **30/08** (3 completadas con pago, checklist y calificación + 1 `no_asistio`), 4 el **31/08** (1 `en_proceso`, 2 `confirmada`, 1 `solicitada`), 4 el **01/09** (2 `solicitada`, 2 `confirmada`).
- Reparto entre los 3 estacionamientos demo, la bahía de profunda, y los 3 lavadores (Carlos Pérez, Luis Gómez, Ana Torres).
- Sobrevive `RES-2026-00013` (Andrés Molina, 31/08 16:00), creada a mano por el usuario probando la app — queda junto a una reserva demo de la misma hora en otro sitio (no hay conflicto de agenda, son estacionamientos distintos).

| Verificación | Resultado |
|---|---|
| `GET /api/reportes/kpis` | ✅ lavados_hoy 5, semana/mes 13, ingresos_mes 78, pendientes 4, ocupación_hoy 54%, calificación 4.3 (3 reseñas) |
| `GET /api/agenda?fecha=2026-08-31` | ✅ capacidades expreso 3 / profunda 2 y asignaciones con cliente, vehículo, servicio, sitio y lavador |
| Fechas en BD | ✅ 30/08, 31/08, 01/09 |

**Credenciales para la demo:** `admin/admin123`, `operador/operador123`, `lavador/lavador123`; clientes ficticios `<nombre>@demo.com` / `cliente123` (ej. `maria.fernandez@demo.com`).

### Notas
- Sigue vigente el detalle de timezone de la Sesión 4: el contenedor backend corre en UTC y el negocio en UTC-5, así que el seed calcula "hoy" en UTC. Corriéndolo en horario laboral no hay diferencia; cerca de la medianoche local sí podría desfasar un día.

---

## Sesión 6 — 2026-08-31

**Pedido del usuario:** análisis de 5 huecos encontrados usando el panel, y luego implementarlos. Sobre el análisis eligió la **variante (a)** del comprobante (lo sube el operador) y pidió el **walk-in completo**.

### Hallazgos del análisis (antes de tocar código)
Tres de los cinco puntos ya estaban resueltos en el backend y solo les faltaba UI. Además aparecieron dos defectos que el usuario no había pedido revisar:

1. **La suspensión no suspendía.** `cliente.controller.eliminar` marcaba `Cliente.estado='inactivo'`, pero el login validaba `Usuario.estado` — otro campo. Un cliente "suspendido" seguía entrando y reservando. Y `auth.middleware` no revisaba estado, así que un token ya emitido servía 24h más.
2. **`/uploads` estaba abierto** (`express.static` sin validación): cualquiera con la URL veía la evidencia fotográfica. Con comprobantes bancarios encima, peor.

Otros dos huecos de fondo:
- **Ningún lavador creado desde el panel podía entrar al sistema.** No existía forma de crearle un `Usuario`, ni por API ni por UI; los únicos usuarios lavador eran los de `seed.js`.
- **`RegistroLavado.observaciones` nunca se llenaba**, así que "la descripción" que el usuario quería en el reporte no se capturaba en ninguna parte.

### Implementado
| Punto del usuario | Qué se hizo |
|---|---|
| 1 · Formulario de clientes en el admin | El alta pasa a **"Cliente atendido en sitio"** (walk-in / telefónico) y opcionalmente crea el acceso con contraseña provisional; antes producía una ficha sin login, inservible. Se agregó editar, suspender/reactivar, y crear acceso / restablecer contraseña. |
| 2 · Servicios sin editar ni eliminar | Formulario de edición completo, incluido `orden_display` (todo lo creado desde el panel quedaba en 99). No se agregó borrado real: se desactiva, con la explicación en pantalla. |
| 3 · Lavadores sin editar; usuario sin dónde | Edición de ficha + **gestión de la cuenta de acceso dentro de la ficha** (`PUT /lavadores/:id/usuario`, `POST /lavadores/:id/usuario/reset`), con la contraseña temporal mostrada una sola vez. Al suspender se avisa que baja la capacidad de la agenda. |
| 4 · Reportes con foto y descripción | Se captura la descripción en el modal de evidencia (con o sin fotos), y se agregó el **acta de servicio en PDF** por reserva (`GET /reportes/reserva/:id/acta.pdf`) con datos, checklist, descripción, fotos antes/después embebidas, pagos y calificación. Más la hoja **"Detalle de lavados"** en el Excel. |
| 5 · Comprobante de transferencia | `Pago.comprobante_url` + multer a `uploads/comprobantes/`, aceptando imagen o PDF. Lo adjunta el operador en el modal de pagos. |
| Walk-in completo | `ModalNuevaReserva`: buscar cliente → elegir o registrar su vehículo → servicio, sitio, fecha y franja disponible. El backend ya aceptaba `id_cliente` para admin/operador; faltaba la pantalla. |

**Archivos nuevos:** `backend/src/utils/credenciales.js`, `backend/src/utils/firmaArchivos.js`, `backend/prisma/demo-imagenes.js`, `frontend/src/components/ModalNuevaReserva.tsx`, `frontend/src/services/descargas.ts`.

### Detalles técnicos que costaron
- **URLs firmadas en vez de header Authorization**: las fotos se consumen desde `<img src="...">` y ahí el navegador no manda el header. La API entrega las rutas con `?exp=&sig=` (HMAC sobre ruta+vencimiento con `JWT_SECRET`, 8h, comparado con `timingSafeEqual`) y el handler de `/uploads` valida. nginx ya proxeaba `/uploads/` al backend y pasa el query string, así que no hubo que tocarlo.
- **pdfkit no tiene glifos `★` ni `✓`** en sus fuentes base: salían como `&&&&&` y `'`. Las estrellas se dibujan como polígonos y el checklist usa `[X]` / `[  ]`.
- **pdfkit solo embebe JPEG y PNG**, pero el uploader acepta webp/gif: el acta cuenta los archivos que no pudo incluir en vez de romperse.
- **Sin `onDelete: Cascade`** en el schema, cualquier borrado de reservas exige eliminar los hijos a mano y en orden.

### Verificación (backend por API, extremo a extremo por nginx en :3041)
| Prueba | Resultado |
|---|---|
| Editar servicio / desactivar / reactivar | ✅ |
| Editar lavador; crear su cuenta; login del lavador; ver "Mis trabajos" | ✅ |
| Username de lavador duplicado | ✅ 409 |
| Crear cliente con acceso → login del cliente | ✅ |
| Suspender cliente → login bloqueado (403 con motivo) y **token ya emitido rechazado** | ✅ |
| Contraseña incorrecta en cuenta suspendida → no revela nada | ✅ "Credenciales inválidas" |
| Reservar para un cliente suspendido | ✅ 403 |
| Evidencia con fotos + descripción; solo descripción; ninguna de las dos | ✅ / ✅ / ✅ 400 |
| `/uploads` sin firma / con firma / firma alterada / caducada | ✅ 403 / 200 / 403 / 403 |
| Pago con comprobante (PNG y PDF); tipo no permitido | ✅ / ✅ 400 |
| Acta PDF: admin, cliente dueño, cliente ajeno | ✅ 200 / 200 / 403 |
| Cliente pidiendo reportes globales | ✅ 403 |
| Excel: 5 hojas incluyendo "Detalle de lavados" | ✅ |
| Walk-in: cliente → vehículo → disponibilidad → reserva → el cliente la ve al entrar | ✅ |
| Anti doble-reserva con el walk-in (agotar cupo de la franja) | ✅ 3 reservas y luego 409 |
| Build del frontend | ✅ "Compiled successfully" |

### Datos de demo
Se re-sembró con `prisma/seed-demo.js` (30/08, 31/08, 01/09). Las completadas ahora traen evidencia fotográfica, descripción coherente con la modalidad, checklist, pago —la mitad por transferencia con comprobante— y calificación, para que las funciones nuevas se vean en la presentación. Las imágenes son **marcadores de posición** generados por `demo-imagenes.js` (PNG con zlib, sin dependencias); en operación las sube el lavador desde su teléfono.

Los artefactos de las pruebas manuales de esta sesión se limpiaron de la BD y del volumen de uploads.

### Notas
- Sigue pendiente el `git push`: el remoto es `https://github.com/megaman0012/lavado_de_carros.git` y la máquina no tiene `gh` ni credential helper. **11 commits locales** sin subir (4 de la sesión 5 + 7 de esta).
- El backup del volumen `uploads_data` (ítem P3 #17) se vuelve más importante: ahora guarda comprobantes de pago, no solo fotos.
- Queda abierta la variante (b) del comprobante: que lo suba el cliente y quede pendiente de validación. Reusa el mismo campo y storage.
