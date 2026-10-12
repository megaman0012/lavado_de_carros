# Changelog

## [Sin publicar]

### 2026-10-12 (3) — Lavado remoto a domicilio (fase 3, pendiente de desplegar)

#### Agregado
- **Lavado a domicilio** (modalidad `remoto`): para servicios expreso, el
  cliente elige "A domicilio" en el paso Lugar, su sector y su dirección, y
  confirma que hay toma de agua y de luz (a domicilio las pone él, salvo que el
  equipo las lleve). También desde "Nueva reserva" del panel, para pedidos por
  teléfono.
- **Sectores** (`Sector`): zonas de cada ciudad con su tiempo de traslado y su
  **recargo**, que se suma una vez por visita. Sin mínimo de carros.
- **Equipos móviles** (`UnidadMovil`): ciudad, horario, carros a la vez, si
  llevan agua o energía, y sus lavadores. **Los lavadores de un equipo no suman
  al expreso de la ciudad.** Hace una visita a la vez y queda ocupado de la
  salida al regreso: traslado + lavado + traslado.
- **Visitas** (`Visita`): programada → en camino (se avisa al cliente por
  WhatsApp/SMS y correo) → llegada con el GPS del celular (queda como prueba y
  se mide la distancia a la dirección) → completada o **fallida**.
- **Visita fallida**: sus reservas pasan al estado `fallida` y se cobra el
  porcentaje del parámetro `remoto.cargo_visita_fallida_pct` (100 %, editable
  por el admin). Se paga como cualquier lavado (contado o corte de empresa); no
  cuenta como lavado pero sí suma al facturado.
- Pantalla **Lavado remoto**: hoja de ruta del día, equipos, sectores, el cargo
  por visita fallida y la productividad (visitas, % del tiempo en traslados,
  recargos, ingresos y causas de las fallidas).
- **Mis trabajos** del lavador: dirección, referencia, contacto (llamar con un
  toque), mapa, y los botones Salí / Llegué / No se pudo lavar. Ve las visitas
  de todo su equipo.
- `Reserva.id_ciudad`: cada reserva guarda su ciudad (la de su sitio o la del
  sector). Los filtros por ciudad, el alcance del operador y los reportes la
  usan, así un lavado a domicilio cuenta en su ciudad.
- Permisos de ubicación en la APK (rigen al recompilarla).
- 16 pruebas nuevas (267 en total).

#### A tener en cuenta
- **En el navegador, el GPS necesita HTTPS.** Mientras el sistema esté en HTTP,
  "Usar mi ubicación" y la marca de llegada funcionan solo en la APK; en la web
  la llegada se registra sin coordenadas.

#### Migración
`backend/prisma/migraciones/2026-10-12_lavado_remoto.sql`: tablas nuevas,
`Reserva.id_ciudad` llenada con la ciudad del sitio de cada reserva, y el
parámetro del cargo al 100 %. Probada sobre una copia de producción (el esquema
coincide exacto).

### 2026-10-12 (2) — Clientes empresa: flota, tarifas y corte mensual (fase 2, pendiente de desplegar)

#### Agregado
- **Cliente de tipo empresa** (`Cliente.tipo`): RUC (13 dígitos, único), razón
  social, email de facturación y dirección fiscal. Su flota son sus vehículos y
  su único usuario es el **gestor de flota**. Se da de alta en Clientes.
- **Tarifas pactadas** (`TarifaEmpresa`): precio por servicio y tipo de
  vehículo que reemplaza al de lista; donde no hay, paga el de lista. La
  duración es la del catálogo y los adicionales van a precio de lista. La
  cotización y la reserva usan la misma regla, así lo que ve el gestor es lo
  que se cobra.
- **Parqueadero privado** (`Estacionamiento.tipo = 'privado'` + `id_cliente`):
  solo esa empresa reserva ahí y no aparece al público. Admite expreso; no planes.
- **Cobro a crédito y corte mensual** (`Reserva.forma_cobro`, `CorteEmpresa`):
  los lavados de una empresa no se cobran sueltos (el panel y la app no ofrecen
  pagarlos y la API lo rechaza). Se juntan en un corte por mes:
  cerrar → facturar (número del sistema contable) → pagar. Pagar registra un
  pago aprobado por lavado, así "cobrado" y los saldos cuadran como siempre.
  Entra todo lo completado y no cortado hasta fin de mes (también lo de meses
  anteriores); un corte cerrado o facturado se puede anular y sus lavados
  vuelven a quedar pendientes. Cancelados y "no asistió" no se cobran.
- **Excel del corte** para el sistema contable: datos de facturación, detalle
  lavado por lavado y resumen por vehículo.
- Pantalla **Empresas** (admin y operador nacional): pendiente sin cortar,
  último corte, tarifas editables con el % de descuento, y los cortes.
- Portal **Mi flota** del gestor: lavados y gasto del mes por vehículo, lo
  pendiente de facturar y sus cortes con el Excel. En la reserva ve sus precios
  pactados y su parqueadero privado primero.
- Columna **Cobro** (contado / crédito) en el detalle del Excel de reportes.
- 20 pruebas nuevas (251 en total).

#### Corregido
- **El "cobrado" de un período dejaba afuera lo cobrado el último día.** Los
  pagos guardan fecha y hora y se comparaban contra la medianoche del último
  día: en el reporte mensual, lo cobrado el día 31 no se contaba.

#### Migración
`backend/prisma/migraciones/2026-10-12_empresas.sql`: solo agrega tablas y
columnas. Los clientes existentes quedan como persona y las reservas, al
contado. Probada sobre una copia de producción (el esquema coincide exacto).

### 2026-10-12 — Operación nacional por ciudades (fase 1 de la expansión, pendiente de desplegar)

Primera de cuatro fases (ciudades → empresas → lavado remoto → VIP). Con sitios
en Quito y Guayaquil la agenda ya mezclaba ciudades; esta fase lo corrige y deja
la base para las siguientes.

#### Corregido
- **La capacidad expreso sumaba lavadores de todo el país.** Un sitio sin
  capacidad propia ofrecía cupos con lavadores de otra ciudad. Ahora cuenta solo
  los de su ciudad.
- **La limpieza profunda contaba las bahías de todo el país** ("el taller es
  uno"). Ahora se reserva en un taller concreto y cuenta solo sus bahías.
- **Un bloqueo manual cerraba todos los sitios del país.** Ahora tiene alcance:
  un sitio, una ciudad o, a propósito, todo el país.
- La ciudad era texto libre y ya convivían "Quito" y "GUAYAQUIL": pasa a ser una
  tabla y se normaliza la escritura.

#### Agregado
- Tabla **`Ciudad`**. Cada sitio, lavador y operador pertenece a una.
- **Tipo de sitio:** `aliado` (edificio/condominio, expreso) o `taller` (bahías
  de la limpieza profunda). Un taller no admite expreso ni planes.
- **Operador por ciudad.** Solo ve y gestiona lo de su ciudad (reservas, agenda,
  sitios, lavadores, pagos, reportes, actas), aunque cambie la URL. Un operador
  sin ciudad es nacional. Servicios, precios, adicionales y tipos de vehículo
  valen para todo el país y solo los cambia lo nacional.
- Pantalla **Usuarios** (admin): crear operadores con su ciudad, trasladarlos,
  suspenderlos (los saca de inmediato) y restablecer su contraseña. Antes no
  había forma de crear operadores desde el panel.
- Pantalla **Ciudades** (admin).
- **Filtro de ciudad** en Dashboard, Agenda, Reservas, Estacionamientos,
  Lavadores y Reportes. Recuerda la elección por navegador.
- **Reporte por ciudad** (`GET /api/reportes/por-ciudad`) y panel nacional en
  Reportes. Todos los reportes y exportaciones aceptan `?id_ciudad=`; el Excel
  suma la hoja "Por ciudad" y la columna de ciudad en el detalle, y el archivo
  dice de qué ámbito es.
- **Cliente:** en el paso "Lugar" elige la ciudad (queda recordada en el
  teléfono) y después el estacionamiento, o el taller si es limpieza profunda.
- `GET /api/public/ciudades` y `?id_ciudad=&tipo=taller` en
  `/api/public/estacionamientos`.
- 28 pruebas nuevas (231 en total): aislamiento entre ciudades, alcance del
  operador, bloqueos, reportes por ciudad, usuarios internos y portal público.

#### Migración
`backend/prisma/migraciones/2026-10-12_ciudades.sql`, probada sobre una copia de
producción (el esquema resultante coincide exactamente con `schema.prisma`):
- Quito y Guayaquil a partir del texto de los sitios.
- El sitio con bahías pasa a `taller`; las 3 reservas de limpieza profunda, que
  no tenían sitio, quedan en ese taller.
- Los lavadores quedan en la ciudad del taller (Quito); se cambian desde Lavadores.
- Usuarios y bloqueos existentes quedan nacionales: funcionan igual que antes.

### 2026-10-08 (2) — Respaldos, Dashboard con gráficas y reportes por mes (pendiente de desplegar)

Cierra el ítem **#17 (respaldos automáticos)** —el último de P3— y separa el
Dashboard de Reportes, que mostraban casi lo mismo.

#### Agregado
- **Respaldo automático diario** (`scripts/respaldo.sh`, cron a las 03:30).
  Guarda la base (`pg_dump -Fc`), el `.env`, la configuración y a qué commit
  correspondían los datos. Retención: 30 diarios + 12 mensuales.
  - **Verificación en cada corrida:** después del dump recorre su índice con
    `pg_restore --list`. Un archivo truncado falla ahí y no el día que haga falta.
  - `--solo-verificar` dice cuántos respaldos hay y cuántos días tiene el más
    reciente: si pasan más de dos, avisa que el cron dejó de correr.
  - **Probado restaurando** el 2026-10-08: las 11 tablas coincidieron exactamente.
    Cierra los casos T-50 y T-51 del plan de pruebas.
- **Filtro por mes en Reportes.** El selector manda sobre todo: tarjetas,
  gráficas y las exportaciones a Excel y PDF, que ahora cubren el mes en pantalla
  y no el histórico completo. Antes no había forma de responder "cuánto
  facturamos en septiembre".
- `GET /api/reportes/resumen?desde=&hasta=`, con **facturado y cobrado por
  separado**: lo que suman los lavados del período no es lo que se cobró dentro
  de él, y confundirlos descuadra la caja.
- Gráfica de **lavados por estacionamiento** en Reportes: el endpoint existía
  desde siempre y no se mostraba en ninguna pantalla.
- 19 pruebas del filtro por mes (203 en total).

#### Cambiado
- **El Dashboard ahora tiene las gráficas.** Era la pantalla de Reportes sin
  ellas, o sea un subconjunto: dos entradas del menú para casi lo mismo. Ahora
  el Dashboard responde "¿cómo vamos ahora?" (hoy, la semana, el mes, y los
  últimos 30 días en gráficas) y Reportes, "¿cómo nos fue en este mes?".
- El aviso de solicitudes pendientes **lleva a Reservas ya filtrado**; antes era
  un cartel que no se podía accionar.
- Las gráficas se rehicieron sobre una paleta verificada: un solo tono —el azul
  del logo, #2E96D4— porque todas son de una sola serie; colores distintos son
  para distinguir series, y acá no hay ninguna que distinguir. La evolución de
  ingresos pasó de barras a una línea con área, que es la forma correcta para
  una serie en el tiempo. Rejilla fina y continua (antes era punteada), barras de
  24 px como máximo y nombres largos acortados, con el nombre completo y el
  número exacto en una tabla debajo de cada gráfica.
- `scripts/respaldo.sh` y `scripts/desplegar.sh` leen el `.env` sin `source`: ese
  archivo admite valores que para bash son sintaxis (`SMTP_FROM=... <correo>`).

#### Corregido
- `scripts/desplegar.sh` fallaba con *"error sintáctico cerca del elemento
  inesperado `newline`"* por hacer `source .env`.

#### Sigue abierto
- El respaldo vive en el **mismo servidor** que el sistema (`DESTINO_EXTERNO`
  vacío): cubre el borrado accidental y el error de migración, no la pérdida del
  servidor.
- El repositorio de GitHub es **público** y tiene la contraseña real de PostgreSQL
  desde el commit inicial (`.env.example` y `src/config/index.js`). Rotarla es lo
  único que lo cierra: borrar las líneas no la saca del historial.
- SEC-01 a SEC-04 y SEC-10 del análisis de seguridad.

### 2026-10-08 (1) — Pruebas, seguridad de sesión y CI (desplegado)

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
