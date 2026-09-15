# Plan de pruebas

Version 1.0 · 2026-09-15

## Alcance y restriccion

Este sistema tiene **datos de negocio reales de un piloto** (18 reservas, 5
pagos). La auditoria **no ejecuto pruebas que modifiquen datos**, y tampoco
pruebas autenticadas: hacerlo habria exigido credenciales de usuarios reales,
que no se solicitaron ni se deben inventar.

Lo ejecutado es lo comprobable sin credenciales y sin escritura.

## Ejecutado

| ID | Caso | Tipo | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| T-01 | Frontend responde | Disponibilidad | 200 | 200 | ✅ |
| T-02 | `GET /api/docs` (Swagger) | Disponibilidad | 200 | 200 | ✅ |
| T-03 | `GET /api/docs/swagger.json` | Disponibilidad | 200 | 200 | ✅ |
| T-04 | PostgreSQL responde | Disponibilidad | conecta | conecta | ✅ |
| T-05 | Version del motor | Inventario | PostgreSQL 15 | 15.18 | ✅ |
| T-06 | Integridad referencial de `Reserva` | Datos | 6 FK definidas | 6 FK | ✅ |
| T-07 | Puerto 5437 alcanzable desde LAN | **Seguridad** | no deberia | **alcanzable** | ❌ SEC-01 |
| T-08 | Puerto 3042 alcanzable desde LAN | **Seguridad** | no deberia | **alcanzable** | ❌ SEC-03 |
| T-09 | Swagger sin autenticacion | **Seguridad** | deberia pedir | **abierto** | ❌ SEC-03 |
| T-10 | Cabeceras de seguridad | **Seguridad** | presentes | **ausentes**, y expone `X-Powered-By` | ❌ SEC-05/06 |
| T-11 | CORS | **Seguridad** | lista blanca | **refleja cualquier origen** | ❌ SEC-04 |
| T-12 | Secretos en el repositorio | Seguridad | ninguno | ninguno (`.env` ignorado) | ✅ |
| T-13 | Fuerza del `JWT_SECRET` | Seguridad | largo y no por defecto | 64 caracteres, no es de ejemplo | ✅ |

**Funcionales y de inventario: 6 de 6 ✅. De seguridad: 2 de 7 ✅.**

## Casos documentados y NO ejecutados

Requieren credenciales o escritura. **Ejecutar solo en un entorno de pruebas o
tras respaldo.**

### Funcionales

| ID | Caso | Esperado |
|---|---|---|
| T-20 | Login con credenciales validas | 200 + token |
| T-21 | Login con contrasena incorrecta | 401 |
| T-22 | Login repetido fallido | **429** tras superar el limite |
| T-23 | Peticion sin token | 401 "Token no proporcionado" |
| T-24 | Token valido de cuenta suspendida | **401 "La cuenta esta suspendida"** |
| T-25 | Cliente accede a endpoint de admin | 403 |
| T-26 | Crear reserva en franja libre | 201 |
| T-27 | Crear reserva en franja ocupada | rechazo |
| T-28 | Subir evidencia (6 imagenes) | aceptado |
| T-29 | Subir 7 imagenes | rechazo por limite |
| T-30 | Subir archivo de 6 MB | rechazo por tamano |
| T-31 | Subir `.exe` renombrado a `.jpg` | **rechazo por mimetype** |
| T-32 | Comprobante PDF | aceptado |
| T-33 | Evidencia PDF | **rechazo** (PDF solo vale para comprobante) |
| T-34 | Pagar reserva ajena siendo cliente | **403** |
| T-35 | Pagar reserva ya pagada | 400 "no tiene saldo pendiente" |
| T-36 | Exportar Excel y PDF | archivo valido |

### Seguridad

| ID | Caso | Por que importa |
|---|---|---|
| T-40 | **Webhook sin firma**: `POST /api/pagos/webhook` con una referencia conocida | Confirmaria SEC-02. Marcaria un pago como aprobado sin pagar. **No ejecutado: modificaria datos financieros** |
| T-41 | Fuerza bruta contra `referencia` del webhook | 32 bits de entropia + limitador |
| T-42 | Escalada de rol modificando el JWT | deberia fallar por firma |
| T-43 | Fuerza bruta contra PostgreSQL en 5437 | sin rate limiting a ese nivel |

### Permisos — matriz a verificar

| Endpoint | admin | operador | lavador | cliente |
|---|---|---|---|---|
| `GET /api/reportes/kpis` | ✅ | ? | ❌ | ❌ |
| `PUT /api/agenda/asignaciones/:id/lavador` | ✅ | ✅ | ❌ | ❌ |
| `GET /api/lavadores/mis-trabajos` | ? | ? | ✅ | ❌ |
| `GET /api/reservas/mis-reservas` | ? | ? | ❌ | ✅ |
| `POST /api/clientes/:id/usuario/reset` | ✅ | ? | ❌ | ❌ |

Las celdas con `?` son `NO DETERMINADO`: exigen leer el `requireRole` de cada
ruta o probarlo. Es el trabajo pendiente mas util de esta matriz.

## Pruebas moviles

⚪ **N/A.** No existe aplicacion movil.

## Pruebas de recuperacion

| ID | Caso | Estado |
|---|---|---|
| T-50 | Restaurar base desde respaldo | **no ejecutable: no hay respaldos** |
| T-51 | Restaurar volumen de archivos | **no ejecutable: no hay respaldos** |
| T-52 | Arranque tras reinicio del servidor | no verificado; `unless-stopped` lo prevee |
| T-53 | Backend espera a que la base este lista | ✅ cubierto por `condition: service_healthy` |
