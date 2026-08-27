# IDEA DE NEGOCIO - Sistema de Lavado de Carros

**Fecha:** 2026-08-21
**Estado:** Definición inicial (Fase 1 - MVP)

---

## 1. Concepto

Servicio de lavado de autos **a domicilio y en sitio**, dirigido a vehículos que permanecen estacionados durante largas jornadas en estacionamientos de edificios, condominios, oficinas y empresas.

**Propuesta de valor:** el cliente no pierde tiempo llevando el auto al lavadero. El auto se lava **mientras está estacionado**, sin supervisión del cliente, y queda listo cuando él lo necesita.

---

## 2. Cómo funciona la mecánica

### 2.1 Modalidad EXPRESA (el servicio va al carro)

1. El cliente deja su carro estacionado en su lugar habitual (edificio/condominio/empresa).
2. Desde el **sitio web** (futuro: app móvil), el cliente:
   - Se registra / inicia sesión.
   - Selecciona el **estacionamiento** donde está su carro.
   - Indica su **vehículo** (placa, marca, modelo, color).
   - Elige uno de los **5 servicios expresos** del catálogo.
   - Selecciona **fecha y franja horaria** en la agenda (las franjas ocupadas aparecen bloqueadas).
   - Confirma la reserva.
3. Un lavador acude al sitio en la franja reservada y realiza la limpieza **sin necesidad ni supervisión del cliente**.
4. El cliente recibe la confirmación de servicio completado (con evidencia fotográfica en fases posteriores).

### 2.2 Modalidad LIMPIEZA PROFUNDA (el cliente lleva el carro)

1. El cliente reserva una franja para llevar su carro al **espacio físico de limpieza** (bahía).
2. Una persona de limpieza **recibe el vehículo** y comienza el trabajo.
3. La capacidad está limitada por las bahías físicas disponibles (ej.: 2 bahías = máximo 2 servicios simultáneos por franja).

---

## 3. Catálogo de servicios (inicial)

| # | Servicio | Modalidad | Duración ref. | Descripción |
|---|----------|-----------|---------------|-------------|
| 1 | Expreso Exterior | Expresa | 30 min | Lavado exterior a presión + secado |
| 2 | Expreso Interior | Expresa | 40 min | Aspirado + limpieza de tablero y plásticos |
| 3 | Expreso Completo | Expresa | 60 min | Exterior + interior |
| 4 | Expreso Premium (encerado) | Expresa | 90 min | Completo + encerado y abrillantado |
| 5 | Expreso Motor + Llantas | Expresa | 45 min | Limpieza de motor, llantas y neumáticos |
| 6 | Limpieza Profunda | En bahía | 180+ min | Shampoo de tapiz, desmanchado, pulido, detalle integral |

> Precios y duraciones se configuran desde el panel admin (`TipoServicio`), no están fijados en código.

---

## 4. Reglas del negocio

1. **Agenda con bloqueo:** una franja reservada no puede volver a venderse. La disponibilidad depende de:
   - **Expresa:** cantidad de lavadores activos asignables al sitio × duración del servicio.
   - **Profunda:** cantidad de bahías físicas del taller.
2. **Estados de la reserva:** `solicitada → confirmada → en_proceso → completada` (+ `cancelada`, `no_asistio`).
3. **El cliente solo ve sus propias reservas**; el personal interno ve todo.
4. **Reportes:** lavados realizados, ingresos por período, ocupación de agenda, ranking de servicios y de estacionamientos.
5. **Pagos:** Fase 1 opera con efectivo/transferencia registrados manualmente; el modelo ya contempla pagos con tarjeta para integrar pasarela (Stripe/MercadoPago) cuando el sistema sea robusto.

---

## 5. Usuarios del sistema

| Rol | Quién es | Qué hace |
|-----|----------|----------|
| `cliente` | Dueño del vehículo (auto-registro web) | Reserva, ve sus reservas, cancela |
| `operador` | Personal administrativo | Gestiona reservas, agenda, catálogos, reportes |
| `lavador` | Personal de limpieza | Ve sus asignaciones del día, marca inicio/fin, sube evidencia |
| `admin` | Dueño del negocio | Todo lo anterior + usuarios, precios, configuración |

---

## 6. Modelo de ingresos

- Venta directa de servicios (precio por tipo de servicio).
- Futuro: planes/suscripciones mensuales para edificios o empresas (lavados incluidos), convenios con administradores de condominios.
- Futuro: comisión por convenio con estacionamientos que ofrecen el servicio como amenity.

---

## 7. Roadmap comercial

| Fase | Alcance |
|------|---------|
| **1 - MVP** | Web de reservas + agenda con bloqueo + panel interno + reportería básica. Operación manual de pagos. |
| **2 - Operación** | Evidencia fotográfica, notificaciones (email/WhatsApp), bloqueos manuales, reportería exportable. |
| **3 - Pagos** | Pasarela de tarjeta, checkout online, reembolsos automáticos. |
| **4 - Escala** | App móvil, más estacionamientos aliados, planes corporativos. |

---

## 8. Ventajas competitivas

- Comodidad total: el cliente no mueve su auto (modalidad expresa).
- Transparencia: agenda visible en tiempo real, estados de la reserva, evidencia del trabajo.
- Operación medible: reportería de ocupación e ingresos desde el día 1.
- Arquitectura preparada para crecer (pagos, app móvil) sin rehacer el sistema.
