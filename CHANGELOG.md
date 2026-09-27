# Changelog

## [Sin publicar]

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
