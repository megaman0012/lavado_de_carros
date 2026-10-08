# Plan de pruebas

Version 2.0 · 2026-10-08 — se agrega la suite automatizada (ítem #14 del plan de
trabajo). La version 1.0, del 2026-09-15, se conserva abajo sin modificar: es el
registro de la auditoria y de lo que en ese momento NO se podia ejecutar.

---

# Parte 1 — Suite automatizada (2026-10-08)

## Como se ejecuta

```bash
cd backend
npm ci
npx prisma generate

# Solo logica pura: sin base de datos, corre en ~2 segundos
npm run test:unitarios

# Todo (requiere una base de PRUEBAS, nunca la real)
export DATABASE_URL_TEST="postgresql://lavado_user:<clave>@localhost:5437/lavado_test"
npm test
```

La base de pruebas se crea una sola vez:

```bash
docker exec lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db -c "CREATE DATABASE lavado_test"
DATABASE_URL="$DATABASE_URL_TEST" npx prisma db push
```

En cada push y cada pull request lo corre GitHub Actions contra un PostgreSQL
propio; ver `docs/16_CI_CD/CI_CD.md`.

## Resguardo contra correr las pruebas sobre produccion

Las pruebas de integracion **vacian tablas**. Tres cosas lo impiden:

1. La URL sale de `DATABASE_URL_TEST`, nunca de `DATABASE_URL` (`tests/entorno.js`).
2. Sin esa variable, `DATABASE_URL` se **borra** del entorno y las pruebas de
   integracion se saltan solas con un aviso, en vez de caer sobre la base real.
3. `tests/ayudas/bd.js` se niega a arrancar si el nombre de la base no contiene
   "test".

## Que cubre

**184 casos, 9 archivos.** Duracion: ~30 s.

### Unitarias — sin base de datos (`tests/unitarios/`)

| Archivo | Casos | Que protege |
|---|---|---|
| `fechas.test.js` | 12 | La convencion "un dia es medianoche UTC" y que "hoy" se calcule en `America/Guayaquil`. Es la regresion de *"reserve el 27 y aparece el 26"*. |
| `agenda.service.test.js` | 14 | El solapamiento de franjas y el conteo de ocupacion: franjas pegadas que no se pisan, el expreso de otro sitio que no quita cupo, el bloqueo manual que ocupa en todas las modalidades. |
| `cotizacion.service.test.js` | 12 | Precio y duracion: servicio segun el tipo de vehiculo + adicionales, y los rechazos (sin tipo, sin tarifa, adicional inexistente). |
| `firmaArchivos.test.js` | 12 | Que un enlace firmado de `/uploads` no sirva para otro archivo, ni alterado, ni vencido. |

### Integracion — API real con supertest (`tests/integracion/`)

| Archivo | Casos | Que protege |
|---|---|---|
| `auth.test.js` | 28 | Login, roles, suspension inmediata, y el ciclo completo del refresh token: rotacion, deteccion de reuso, cierre de sesion, revocacion al restablecer la contrasena. |
| `reservas.test.js` | 48 | Creacion, validaciones, **que una franja no se venda dos veces** (incluido el caso de dos pedidos simultaneos), planes de edificio, flujo de estados y quien puede hacer que. |
| `agenda.test.js` | 19 | Disponibilidad: franjas, capacidades por sitio, bahias, dias pasados — y que lo que la agenda marca sin cupo sea exactamente lo que crear reserva rechaza. |
| `clientes-vehiculos.test.js` | 28 | Los vehiculos que ve el panel por cada cliente, el alta desde el panel y que un cliente no pueda ver ni tocar los de otro. |
| `seguridad.test.js` | 11 | Cabeceras de helmet y que `/uploads` no entregue nada sin firma. |

## La prueba que mas importa

`reservas.test.js` → *"dos pedidos simultaneos por el ultimo cupo: entra
exactamente uno"*. Dispara las dos peticiones en paralelo contra un sitio de
capacidad 1 y exige un 201, un 409 y **una sola fila** en la tabla.

Es la unica forma de verificar que la transaccion serializable de
`reserva.controller.js` sigue en su lugar. Sin ella, el dia que alguien la
cambie por una transaccion normal nadie se entera hasta que dos clientes se
presentan a la misma hora.

## Casos de la version 1.0 que quedaron automatizados

| ID v1.0 | Caso | Donde quedo |
|---|---|---|
| T-20, T-21 | Login valido / invalido | `auth.test.js` |
| T-23 | Peticion sin token | `auth.test.js` |
| T-24 | Token de cuenta suspendida | `auth.test.js` |
| T-25 | Cliente en endpoint de admin | `auth.test.js`, `clientes-vehiculos.test.js` |
| T-26, T-27 | Reserva en franja libre / ocupada | `reservas.test.js` |
| T-34 | Operar la reserva de otro cliente | `reservas.test.js` |
| T-42 | Escalada de rol modificando el JWT | `auth.test.js` (token firmado con otro secreto → 401) |
| T-10 | Cabeceras de seguridad | `seguridad.test.js` — **corregido**: helmet las agrega y `X-Powered-By` ya no se expone |

La **matriz de permisos** de la v1.0, que quedaba con celdas `?`, esta resuelta
en el codigo para clientes, vehiculos, reservas y agenda: cada combinacion
rol × endpoint de esas areas tiene su caso.

## Lo que sigue sin cubrir

| Area | Por que |
|---|---|
| Subida de archivos (T-28 a T-33) | Multer con archivos reales; se puede hacer con `.attach()` de supertest, no se hizo en esta vuelta. |
| Webhook de pagos (T-40, T-41) | SEC-02 sigue abierto: el webhook no verifica firma porque no hay pasarela conectada. Probarlo sin arreglarlo solo documentaria el agujero. |
| Reportes Excel / PDF (T-36) | Generan binarios; verificar su contenido pide otra clase de prueba. |
| Frontend | No hay pruebas de componentes. La CI verifica tipos y build, no comportamiento. |
| Recuperacion (T-50 a T-53) | Sigue dependiendo de que existan respaldos (item #17, abierto). |

---

# Parte 2 — Auditoria 2026-09-15 (version 1.0, sin modificar)

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
