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
| 14 | **Tests backend** (Jest + supertest: reservas, agenda, anti doble-reserva) | La lógica de solapamiento es crítica; un regression ahí cuesta clientes | M | ☐ |
| 15 | **Seguridad dura**: rate limiting, helmet, refresh token, expiración JWT | Recomendable antes de exponer a internet público | S-M | ☐ |
| 16 | **CI/CD** (build + tests automáticos) | Cuando haya tests (ítem 14) | M | ☐ |
| 17 | **Backups automáticos de Postgres** | Los datos de clientes/pagos son críticos | S | ☐ |

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
