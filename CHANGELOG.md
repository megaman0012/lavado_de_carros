# Changelog

## [Sin publicar]

### 2026-10-08 — Pruebas, seguridad de sesión y CI (pendiente de desplegar)

Cierra los ítems **#14 (tests backend)**, **#15 (seguridad dura)** y **#16
(CI/CD)** del `PLAN_TRABAJO.md`, y agrega la vista de vehículos por cliente en
el panel.

#### Agregado
- **184 pruebas automatizadas** (`backend/tests/`, Jest + supertest).
  - *Unitarias*, sin base de datos: fechas, solapamiento de franjas, cotización
    y firma de archivos.
  - *De integración*, contra un PostgreSQL de pruebas: autenticación, reservas,
    agenda, clientes/vehículos y cabeceras de seguridad.
  - La que más importa: **dos pedidos simultáneos por el último cupo entran
    exactamente una vez**. Es la única forma de verificar que la transacción
    serializable de `reserva.controller.js` sigue en su lugar.
  - Resguardo: la URL sale de `DATABASE_URL_TEST`, nunca de `DATABASE_URL`, y
    `tests/ayudas/bd.js` se niega a vaciar una base cuyo nombre no diga "test".
- **`helmet`** con tres desvíos del default, cada uno razonado en el código:
  CSP que no rompe Swagger UI, `crossOriginResourcePolicy: cross-origin` para
  que la APK pueda mostrar las fotos de `/uploads`, y HSTS apagado mientras el
  despliegue sea HTTP.
- **Refresh token revocable.** El acceso pasa a durar **15 minutos** y la sesión
  la sostiene un token opaco de **7 días**, guardado solo como SHA-256, que rota
  en cada uso. Reusar una copia revocada corta la sesión entera. Endpoints
  nuevos: `POST /api/auth/refresh` y `POST /api/auth/logout`.
  - Cerrar sesión ahora revoca en el servidor, no solo en el navegador.
  - **Restablecer una contraseña echa a esa persona de todos lados en el acto.**
  - El cliente renueva solo ante un 401 y repite la petición: el usuario no nota
    nada. La renovación está serializada (una sola en vuelo) para que dos
    pestañas no parezcan el reuso de un token robado.
- **Integración continua** (`.github/workflows/ci.yml`): en cada push y cada PR
  corre las pruebas del backend contra un PostgreSQL real, verifica tipos y
  build del frontend, y construye las dos imágenes Docker.
- **`scripts/desplegar.sh`**: despliegue con comprobación del `.env`, aplicación
  de las migraciones pendientes —anotadas en `_migracion_aplicada`, para que no
  se repitan ni se olviden— y espera al health check.
- **El panel ve los vehículos de cada cliente.** En *Clientes*, el número de la
  columna *Vehículos* despliega la lista bajo la fila: placa, tipo, marca,
  modelo, color y estado. Desde ahí se agrega un vehículo, se corrige su tipo o
  se da de baja. **Un vehículo sin tipo se marca en ámbar**: sin tipo no hay
  precio y ese cliente no puede reservar, y es la primera causa de la llamada
  "no me deja reservar".

#### Cambiado
- `src/index.js` se partió en dos: **`src/app.js`** arma la aplicación y
  `src/index.js` abre el puerto y programa el cron. Era necesario para que las
  pruebas importen la app sin levantar un servidor ni disparar recordatorios.
- `GET /api/clientes` devuelve los vehículos con el tipo ya resuelto y ordenados
  por placa, para que el panel no tenga que cruzar el catálogo en el navegador.
- El logger se calla con `NODE_ENV=test` (Winston escribe directo a stdout y el
  `silent` de Jest no lo alcanzaba).
- `.env`: `JWT_EXPIRES_IN` pasa de `24h` a `15m`; se agrega `REFRESH_EXPIRA_DIAS`.

#### Migración
- `backend/prisma/migraciones/2026-10-08_refresh_tokens.sql`: agrega la tabla
  `RefreshToken`. **No toca ningún dato existente.** Las sesiones abiertas con
  un JWT de 24 horas siguen valiendo hasta vencer; al vencer, esa gente inicia
  sesión una vez y queda con el flujo nuevo.

#### Sigue abierto
- #17 Respaldos automáticos de Postgres — el único ítem de P3 que queda, y el
  más importante antes de automatizar el despliegue.
- SEC-01 a SEC-04 y SEC-10 del análisis de seguridad (exposición de red, webhook
  de pagos sin firma, HTTPS).

### 2026-09-27 — Total Clean Car (pendiente de desplegar)

Referencia de diseño: la compra de una entrada de cine (sala = tipo de vehículo,
película = servicio, confitería = adicionales, función = día y hora con cupos).

#### Cambiado
- **Nombre y marca: Total Clean Car.** Logo y paleta (#2E96D4 / #3459A5) de
  `docs/lavadodecarro.png` en la web, el manifest, los íconos, los correos y los PDF.
- **Precios por tipo de vehículo.** El precio y la duración salen de la tabla
  `PrecioServicio` (servicio × tipo). `TipoServicio.precio` y `duracion_min` se
  eliminaron. Un servicio sin precio para un tipo no se le ofrece.
- **Tipo de vehículo obligatorio** al registrar, con catálogo `TipoVehiculo`
  (moto, liviano, SUV, camioneta; el admin puede crear más). `Vehiculo.tipo`
  (texto) pasó a `id_tipo_vehiculo`.
- **Flujo de reserva nuevo:** vehículo → servicio → adicionales → lugar → función
  → boleto. El paso vive en la URL.
- Pantalla Servicios con pestañas: precios por tipo, adicionales y tipos de vehículo.
- La grilla de horarios empieza en horarios fijos (:00 / :30).

#### Agregado
- **Servicios adicionales** (`ServicioAdicional`, `ReservaAdicional`): suman precio
  y minutos. Se guarda una copia de nombre y precio en cada reserva. Los planes de
  edificio no los cubren.
- `POST /api/reservas/cotizar`, `/api/public/tipos-vehiculo`, `/api/public/adicionales`,
  y CRUD interno en `/api/tipos-vehiculo` y `/api/adicionales`.
- Preparación para la APK: `docs/15_APK/Preparacion_APK.md`,
  `frontend/capacitor.config.json`, `frontend/resources/`, `REACT_APP_SERVIDOR`
  y `CORS_ORIGINS`.

#### Corregido
- **Fecha un día antes.** El navegador (UTC-5) convertía la medianoche UTC de
  `Reserva.fecha` al día anterior. Los días se manejan con `utils/fechas` en el
  backend y en el frontend. "Hoy" se calcula en `APP_TZ` (America/Guayaquil):
  desde las 19:00 el servidor, que corre en UTC, ya contaba el día siguiente.
- **Sesión que "se perdía" al volver atrás.** El login quedaba en el historial y
  la portada siempre decía "Ingresar". Ahora el login redirige si hay sesión, no
  queda en el historial, y la portada ofrece "Mi cuenta".
- **Service worker** con caché permanente de `index.html`: quien tenía la PWA
  instalada no recibía actualizaciones. Ahora es red primero; nginx sirve
  `index.html` sin caché.
- **Cupos inconsistentes.** Crear reserva contaba la capacidad global, y la
  disponibilidad la del sitio. Ahora las dos usan la misma regla, en una
  transacción serializable (dos clientes no pueden quedarse con el mismo cupo).
- No se puede reservar una franja que ya empezó ni una fuera del horario de atención.
- Recordatorios a las 18:00 hora de Ecuador (salían a las 13:00).
- El cliente puede completar el tipo de sus propios vehículos (solo los suyos).

#### Migración
- `backend/prisma/migraciones/2026-09-27_tipos_vehiculo_y_adicionales.sql`: se
  aplica una vez, en una transacción. Copia los precios actuales a los tipos
  liviano, SUV y camioneta. **Moto queda sin precios** hasta que el admin los cargue.


### Agregado
- **2026-09-15** — Documentacion tecnica completa en `docs/` (13 areas
  aplicables; mobile N/A), `INFORME_AUDITORIA.md` y este changelog.

### Sin cambios
- No se modifico codigo, configuracion, Docker ni datos.

## [2026-08-31]

### Agregado
- Rate limiting en la API, con clave por id de usuario (commit `6b43182`).

### Documentado
- Analisis Dashboard vs Reportes (commit `6580332`).

## [Anterior a 2026-08-31]

### Agregado
- Flujo de comprobantes: el cliente sube y el operador valida (`314d041`,
  `ee633a3`).
- Seed de demostracion (`9837353`).

*Reconstruido desde el historial de git; el proyecto no llevaba changelog.*
