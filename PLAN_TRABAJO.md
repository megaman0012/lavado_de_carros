# PLAN DE TRABAJO - Sugerencias priorizadas

**Proyecto:** Sistema de Lavado de Carros
**Fecha:** 2026-08-21
**Estado base:** MVP funcional (auth 4 roles, reservas, agenda con bloqueo, asignación de lavadores, evidencia fotográfica, KPIs, dockerizado en 3041/3042/5437)

> Marcar cada ítem con ✅ sí / ❌ no / ⏸ después y ajustar el orden según decisión.

---

## Criterios de priorización

1. **Valor operativo inmediato** → ¿lo necesitamos para operar esta semana?
2. **Esfuerzo** → S (horas) / M (1-2 días) / L (3+ días)
3. **Dependencias** → ¿bloquea o habilita otros ítems?

---

## P0 — Cierre del ciclo de uso real (recomendado: AHORA)

| # | Ítem | Por qué | Esfuerzo | Decisión |
|---|------|---------|----------|----------|
| 1 | **Vista "Mis trabajos" (rol lavador)** | El lavador hoy no puede ver sus asignaciones ni subir evidencia desde su cuenta; sin esto el flujo diario no cierra | S | ✅ |
| 2 | **Cliente ve evidencia antes/después en MisReservas** | Cierra la confianza del cliente; las fotos ya existen, solo falta mostrarlas | S | ✅ |
| 3 | **Detalle de reserva para cliente** (estado, historial de cambios, lavador asignado) | Transparencia; reduce llamadas/whatsapp preguntando "¿ya está listo?" | S | ✅ |
| 4 | **Configurar franjas horarias y capacidad por estacionamiento** (en BD, no fijo en código) | Permite operar sitios distintos con horarios distintos sin tocar código | M | ✅ |

## P1 — Robustez operativa (recomendado: siguiente sprint)

| # | Ítem | Por qué | Esfuerzo | Decisión |
|---|------|---------|----------|----------|
| 5 | **Notificaciones email** (creación, confirmación, completado) | El cliente no tiene forma de enterarse del estado sin entrar al sitio | M | ✅ |
| 6 | **Reportería exportable Excel/PDF** | Ya existe lógica en el proyecto base (create-test-excel.js); ingresos, lavados por sitio/servicio/lavador | M | ✅ |
| 7 | **Registro de pago manual** (efectivo/transferencia) sobre la reserva | Antes de pasarela de tarjeta, hace falta registrar que se cobró; alimenta KPI de ingresos real | S-M | ✅ |
| 8 | **Gestión de plazas ocupadas / mapeo visual del estacionamiento** | Útil cuando haya varios sitios; puede esperar si arrancamos con 1-2 | M-L | ✅ |

## P2 — Negocio y crecimiento (decidir tras primeras semanas operando)

| # | Ítem | Por qué | Esfuerzo | Decisión |
|---|------|---------|----------|----------|
| 9 | **Pagos con tarjeta (MercadoPago/Stripe)** | Ya mapeado en modelo (`Pago`); conviene recién cuando el volumen manual justifique | L | ✅* |
| 10 | **Planes/suscripciones para condominios** | Ingreso recurrente; requiere primero validar demanda | L | ✅ |
| 11 | **Calificaciones/reseñas post-lavado** | Confianza y calidad; simple una vez cerrado P0 | S-M | ✅ |
| 12 | **Recordatorios WhatsApp/SMS** | Reduce no-shows en profunda; depende de proveedor externo | M | ✅* |
| 13 | **PWA instalable** | Paso previo barato a app nativa; el sitio ya es responsive | M | ✅ |

\* #9 y #12 quedaron con el código funcional pero sin una cuenta real conectada (decisión tomada con el usuario 2026-08-22): #9 no integra ningún SDK de pasarela todavía (webhook y flujo agnósticos, listos para Stripe o MercadoPago); #12 usa Twilio con el mismo patrón "seguro por defecto" que el email — sin credenciales en `.env`, el mensaje solo se registra en el log.

## P3 — Técnico / deuda técnica (intercalar, no urgente)

| # | Ítem | Por qué | Esfuerzo | Decisión |
|---|------|---------|----------|----------|
| 14 | **Tests backend** (Jest + supertest: reservas, agenda, anti doble-reserva) | La lógica de solapamiento es crítica; un regression ahí cuesta clientes | M | ✅ 2026-10-08 |
| 15 | **Seguridad dura**: rate limiting, helmet, refresh token, expiración JWT | Recomendable antes de exponer a internet público | S-M | ✅ 2026-10-08 (rate limiting 2026-08-31) |
| 16 | **CI/CD** (build + tests automáticos) | Cuando haya tests (ítem 14) | M | ✅ 2026-10-08 (CI completo; el despliegue es un script, no automático) |
| 17 | **Backups automáticos de Postgres** | Los datos de clientes/pagos son críticos | S | ☐ **el único que queda** |

---

## Qué NO haría todavía (recomendación)

- **App nativa (Android/iOS)** → la web responsive + PWA cubre el 90% a costo mínimo.
- **Microservicios / separar servicios** → el monolito actual sobra para el volumen inicial.
- **Multi-moneda / facturación electrónica formal** → definir con contador cuando haya operaciones reales.
- **Panel de analítica avanzada (BI)** → los KPIs actuales bastan para arrancar.

---

## Orden propuesto (si todo fuera ✅)

```
Sprint A (P0):   1 → 2 → 3 → 4        ← cierra el flujo diario completo
Sprint B (P1):   7 → 5 → 6            ← cobrar, avisar, reportar
Sprint C (P3):   17 → 15 → 14         ← endurecer antes de crecer
Sprint D (P2):   11 → 13 → 9          ← crecimiento
Resto:           según demanda real
```

**Regla práctica:** nada de P2 antes de tener 2-3 semanas de operación real con P0+P1.
> Actualización 2026-08-22: el usuario pidió avanzar con todo P2 de una vez; ver `HISTORIAL_CHAT.md` (Sesión 4) para el detalle de qué quedó activo y qué quedó en modo "código listo, sin credenciales reales".

---

## Sprint E — Administración, evidencia y walk-in (2026-08-31) ✅ COMPLETO

Surge del análisis del usuario sobre huecos encontrados usando el panel. Todos los ítems quedaron implementados y probados en esta sesión.

| # | Ítem | Esfuerzo | Estado |
|---|------|----------|--------|
| E1 | Editar servicios (incl. orden en catálogo) desde el panel | S | ✅ |
| E2 | Editar ficha de lavadores | S | ✅ |
| E3 | **Suspensión efectiva** de clientes y lavadores (era decorativa) | S | ✅ |
| E4 | Clientes: editar, suspender/reactivar, crear acceso / restablecer contraseña | S-M | ✅ |
| E5 | **Cuenta de acceso del lavador** desde su ficha (no existía por ninguna vía) | M | ✅ |
| E6 | `/uploads` detrás de URL firmada | S | ✅ |
| E7 | Descripción del trabajo en la evidencia (`observaciones` nunca se llenaba) | S | ✅ |
| E8 | **Acta de servicio en PDF** por reserva, con fotos embebidas | M | ✅ |
| E9 | Comprobante de transferencia adjunto al pago (variante a: lo sube el operador) | S | ✅ |
| E10 | Hoja "Detalle de lavados" en el Excel | S | ✅ |
| E11 | **Walk-in completo**: alta de reserva desde el panel a nombre de un cliente | M | ✅ |

| E12 | **Variante b**: el cliente sube su comprobante y el operador lo valida | M | ✅ |

### Decisiones tomadas con el usuario
- **Comprobante de transferencia**: se implementaron **las dos variantes**. El operador puede adjuntar el comprobante que le mandan (a), y el cliente puede enviarlo él mismo desde "Mis Reservas" (b), quedando `en_verificacion` hasta que un operador lo apruebe. Un cliente nunca puede aprobar su propio pago.
- **Servicios y clientes no se borran**: se desactivan/suspenden. Sus reservas históricas los referencian y borrarlos rompería el histórico y los reportes.
- **Sin pantalla de "usuarios"**: para 3-5 personas, las credenciales del lavador se gestionan dentro de su ficha.

### Lo que sigue abierto (P3)
- **#17 Backups de Postgres** — el único que queda. Se vuelve más importante con
  cada vuelta: el volumen `uploads_data` guarda comprobantes de pago, no solo
  fotos, y ahora que el despliegue es un script conviene poder volver atrás.
- #14, #15 y #16 quedaron cerrados el 2026-10-08 (ver el sprint F).

---

## Sprint F — Pruebas, seguridad de sesión y CI (2026-10-08) ✅ COMPLETO

Cierra los tres ítems técnicos que quedaban de P3, más una mejora del panel
pedida por el usuario.

| # | Ítem | Esfuerzo | Estado |
|---|------|----------|--------|
| F1 | **#14** — 184 pruebas (Jest + supertest), unitarias y de integración | M | ✅ |
| F2 | **#15** — `helmet` con CSP compatible con Swagger y la APK | S | ✅ |
| F3 | **#15** — refresh token revocable, con rotación y detección de reuso | M | ✅ |
| F4 | **#16** — CI en GitHub Actions (pruebas, tipos, build, imágenes Docker) | M | ✅ |
| F5 | **#16** — `scripts/desplegar.sh` con migraciones anotadas y health check | S | ✅ |
| F6 | El admin ve los vehículos de cada cliente desde la pantalla Clientes | S | ✅ |

### Decisiones tomadas con el usuario
- **Duración de la sesión: 15 min de acceso + 7 días de refresco.** Se eligió
  sobre la alternativa de 1 h + 30 días: el usuario no nota diferencia (sigue
  entrando una vez por semana) y un token robado sirve 15 minutos en vez de 24
  horas.
- **Los vehículos se ven desplegando la fila en Clientes**, no en una pantalla
  aparte. Una pantalla global de vehículos (buscar por placa → quién es el
  dueño) quedó descartada por ahora; si el volumen la pide, es un agregado
  pequeño sobre `GET /api/vehiculos`, que ya acepta filtros.

### Decisiones tomadas en la implementación
- **El refresh token vive en `localStorage`, no en una cookie `httpOnly`.** La
  APK de Capacitor corre en el origen `https://localhost` y hablaría con el
  servidor como un tercero, donde una cookie `SameSite=None; Secure` sobre un
  despliegue HTTP no funciona. La ganancia frente a antes —15 minutos en vez de
  24 horas, y poder revocar— se mantiene igual. Es la siguiente mejora el día
  que la web deje de compartir cliente con la APK.
- **El despliegue no se automatizó desde GitHub.** Haría falta abrir SSH a
  internet o instalar un runner autoalojado, y conviene cerrar antes el #17:
  desplegar solo, sin poder volver atrás, cambia un trabajo manual por un
  riesgo. El camino está documentado en `docs/16_CI_CD/CI_CD.md`.
- **Las pruebas de subida de archivos quedaron fuera** de esta vuelta (multer
  con archivos reales). El webhook de pagos tampoco se probó: SEC-02 sigue
  abierto porque no hay pasarela conectada, y probarlo sin arreglarlo solo
  documentaría el agujero.
