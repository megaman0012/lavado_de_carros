# Analisis de seguridad

Revision del **2026-09-15**. **Actualizado el 2026-10-08** al cerrar el item #15
del plan de trabajo: se agrego `helmet` y el token de acceso paso a durar 15
minutos, con un refresh token revocable sosteniendo la sesion.

Los hallazgos corregidos quedan en su lugar, marcados como ✅ CERRADO y con lo
que se hizo. Borrarlos haria perder el porque.

## Resumen

| Severidad | 2026-09-15 | 2026-10-08 | Cerrados |
|---|---|---|---|
| 🔴 CRITICO | 0 | 0 | — |
| 🟠 ALTO | 3 | 3 | — |
| 🟡 MEDIO | 4 | 2 | SEC-05, SEC-06 |
| 🔵 BAJO | 2 | 2 | — |
| ⚪ INFORMATIVO | 1 | 1 | — |

SEC-11 se agrego y se cerro en la misma vuelta (2026-10-08).

**Lectura general:** este proyecto tiene la mejor postura de seguridad de las
auditadas hasta ahora. La autenticacion, la autorizacion por rol, el rate
limiting y la validacion de subidas estan bien resueltos y **razonados en el
propio codigo**. Los hallazgos altos son de **exposicion de red** y de una
**integracion de pagos a medio terminar**, no de errores de programacion.

## 🟠 ALTO

### SEC-01 — PostgreSQL alcanzable desde la red local

**Evidencia:** `docker-compose.yml` publica `"5437:5432"` sin restringir
interfaz. Comprobado: el puerto 5437 **acepta conexion TCP desde
192.168.3.124**. Ademas, **no esta declarado en firewalld** (`firewall-cmd
--list-ports` no lo incluye) y aun asi responde, porque Docker inserta sus
reglas por debajo de firewalld.

**Impacto:** cualquier equipo de la red local puede intentar autenticarse
contra la base de datos directamente, sin pasar por la aplicacion. Un ataque de
fuerza bruta contra la contrasena de PostgreSQL no encontraria ningun rate
limiting, porque el de la aplicacion solo cubre la API.

**Recomendacion:** cambiar a `"127.0.0.1:5437:5432"`. El proyecto psicometrico
de este mismo servidor ya lo hace asi; sirve de referencia interna.

### SEC-02 — Webhook de pagos sin validacion de firma

**Evidencia:** `backend/src/controllers/pago.controller.js`, funcion
`webhook()`. Acepta `{referencia, estado}` en el cuerpo, busca el pago por
`referencia` y, si esta pendiente, lo marca como `aprobado` o `rechazado`.
**No verifica firma, ni token, ni origen.** La ruta
(`backend/src/routes/pago.routes.js:14`) no lleva middleware de autenticacion.

**Atenuantes reales:**
- La `referencia` es `PEND-<id>-<8 hex>`, con 4 bytes aleatorios
  (`crypto.randomBytes(4)`), o sea 32 bits. No es adivinable de un intento.
- La ruta si tiene limitador de frecuencia (`limitadorWebhook`).
- **La pasarela de pagos todavia no esta conectada**: `iniciarTarjeta()`
  responde literalmente *"Pasarela de pago no conectada todavia; este pago
  queda pendiente hasta integrar Stripe/MercadoPago"*.

**Impacto:** hoy el riesgo es acotado porque no hay dinero real circulando.
**El momento de peligro es la conexion de la pasarela**: si se integra Stripe o
MercadoPago sin agregar validacion de firma, quien conozca una referencia podra
marcar pagos como aprobados sin haber pagado.

**Recomendacion:** validar la firma HMAC del proveedor **antes** de conectar la
pasarela. Es requisito de Stripe y de MercadoPago, no un extra.

### SEC-03 — La API y su documentacion Swagger, expuestas sin autenticacion

**Evidencia:** el puerto 3042 acepta conexion desde la red local; `/api/docs`
responde **HTTP 200 sin credenciales**, igual que `/api/docs/swagger.json`.
Tampoco esta declarado en firewalld.

**Impacto:** Swagger entrega el mapa completo de la API — todos los endpoints,
parametros y estructuras — a cualquiera en la red. No es una vulnerabilidad por
si sola, pero facilita el trabajo a quien busque una.

**Recomendacion:** publicar la API en `127.0.0.1` y servirla a traves del
nginx del frontend; y restringir `/api/docs` a entornos que no sean produccion.

## 🟡 MEDIO

### SEC-04 — CORS permisivo con credenciales

**Evidencia:** `backend/src/app.js` (hasta el 2026-10-08, `src/index.js:30`) —
`app.use(cors({ origin: true, credentials: true }))`.

`origin: true` **refleja el Origin que envie quien llame**, es decir acepta
cualquiera, y lo combina con `credentials: true`. Comprobado en la respuesta:
`Vary: Origin` y `Access-Control-Allow-Credentials: true`.

**Atenuante:** la autenticacion es **Bearer en cabecera**, no cookie, asi que un
sitio de terceros no puede aprovechar la sesion del navegador automaticamente.

**Recomendacion:** declarar la lista de origenes permitidos en vez de reflejar
cualquiera.

### SEC-05 — Sin cabeceras de seguridad (falta helmet) · ✅ CERRADO 2026-10-08

**Evidencia (2026-09-15):** la respuesta de la API no incluia
`Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` ni
`Content-Security-Policy`. No habia `helmet` en las dependencias.

**Corregido:** `helmet` montado en `backend/src/app.js`, con tres desvios del
default, cada uno razonado en el propio codigo:

| Ajuste | Por que |
|---|---|
| `contentSecurityPolicy` permite estilos y scripts inline | el CSP por defecto deja Swagger UI (`/api/docs`) en blanco. El HTML de la aplicacion no sale de la API: lo sirve nginx, con su propio origen. |
| `crossOriginResourcePolicy: cross-origin` | las fotos y comprobantes de `/uploads` se muestran con `<img src>` desde la APK de Capacitor, que corre en el origen `https://localhost`. Con el default (`same-origin`) el operador veria recuadros vacios. |
| `hsts: false` | el despliegue actual es HTTP detras de nginx. Activarlo sin TLS no protege nada y, si alguien entra una vez por HTTPS, deja el dominio clavado ahi por meses. **Cuando haya certificado: `hsts: { maxAge: 15552000 }`.** |

Verificado por `backend/tests/integracion/seguridad.test.js`, que falla si
alguien quita helmet o afloja estos valores.

### SEC-06 — La version del framework se anuncia en cada respuesta · ✅ CERRADO 2026-10-08

**Evidencia (2026-09-15):** cabecera `X-Powered-By: Express`.

**Corregido:** helmet la quita. Con prueba automatizada en `seguridad.test.js`.

### SEC-11 — El token de sesion duraba 24 horas y no se podia revocar · ✅ CERRADO 2026-10-08

Hallazgo agregado el 2026-10-08, al revisar el item #15 del plan (no estaba en
la auditoria original).

**Problema:** el JWT duraba 24 horas y no se guardaba en ningun lado, asi que no
habia forma de anularlo. Quien se quedaba con el token de un operador —un celular
prestado, un `localStorage` leido— tenia un dia entero de acceso, y "cerrar
sesion" solo lo borraba del navegador propio. Restablecer una contrasena tampoco
cortaba nada: el token viejo seguia valiendo.

**Corregido:** la sesion son ahora dos piezas (`backend/src/services/sesion.service.js`):

- **Token de acceso** — el JWT de siempre, pero de **15 minutos**. Sigue sin
  guardarse: vale por su firma. Robado, caduca solo.
- **Token de refresco** — 48 bytes aleatorios (no un JWT: no dice nada ni vale
  por si mismo), **7 dias**, guardado en la tabla `RefreshToken`. En la base
  queda **solo su SHA-256**: quien lea la tabla no se lleva sesiones usables.

Tres propiedades que antes no existian:

1. **Rotacion.** Cada renovacion quema el token usado y entrega otro.
2. **Deteccion de reuso.** Si llega un token ya revocado, hay dos copias dando
   vueltas: se corta la *familia* entera. La victima vuelve a entrar; el
   atacante queda afuera.
3. **Revocacion de verdad.** Cerrar sesion avisa al servidor. Restablecer una
   contrasena corta todas las sesiones abiertas con la anterior.

El cliente serializa la renovacion (una sola en vuelo, `frontend/src/services/api.ts`)
porque el panel dispara varias llamadas por pantalla y dos refrescos simultaneos
del mismo token pareceran —con razon— el reuso de una copia.

**Lo que no cambia:** el refresh token vive en `localStorage`, no en una cookie
`httpOnly`. Es la decision pragmatica por la APK: Capacitor corre en el origen
`https://localhost` y hablaria con el servidor como un tercero, donde una cookie
`SameSite=None; Secure` sobre un despliegue HTTP no funciona. La ganancia real
frente a antes —ventana de 15 minutos en vez de 24 horas, y poder revocar— se
mantiene igual. Si algun dia la web deja de compartir cliente con la APK, la
cookie `httpOnly` es la siguiente mejora.

Cubierto por 28 casos en `backend/tests/integracion/auth.test.js`.

### SEC-07 — El rol es texto libre, sin restriccion en la base de datos

**Evidencia:** `backend/prisma/schema.prisma:20` —
`rol String @default("cliente")`, con los valores validos solo en un
comentario. No es un `enum` de PostgreSQL ni tiene `CHECK`.

**Impacto:** un error de escritura al crear un usuario por fuera de la
aplicacion (por ejemplo `"Admin"` en vez de `"admin"`) produce una cuenta que
no encaja en ningun rol. `requireRole` compara con igualdad exacta, asi que esa
cuenta quedaria sin permisos — falla de forma segura, pero silenciosa.

**Recomendacion:** convertir a `enum` de Prisma, que genera la restriccion en
la base.

## 🔵 BAJO

### SEC-08 — Limite de cuerpo JSON de 20 MB

**Evidencia:** `express.json({ limit: '20mb' })`. Es generoso para una API cuyo
cuerpo mas grande son datos de reserva; las imagenes van por multipart con su
propio limite de 5 MB.

**Recomendacion:** bajarlo a 1-2 MB.

### SEC-09 — Rate limiting en memoria

**Evidencia:** documentado por el propio codigo. Correcto para una instancia
unica, que es el despliegue actual. Queda anotado por si se escala.

## ⚪ INFORMATIVO

### SEC-10 — Sin HTTPS

Todo el trafico es HTTP plano, incluido el login. Las credenciales viajan en
claro dentro de la red. Es la situacion general del servidor, no solo de este
proyecto.

## Lo que se reviso y esta BIEN

Vale la pena dejarlo escrito, porque es mucho:

- **Contrasenas con `bcryptjs`**, no en claro ni con hash simple.
- **`JWT_SECRET` de 64 caracteres**, sin coincidencia con valores de ejemplo
  conocidos. No es un secreto por defecto.
- **La autenticacion revalida contra la base en cada peticion** y corta el
  acceso de cuentas suspendidas de inmediato, sin esperar a que caduque el
  token. Esto es mas de lo que hace la mayoria de las implementaciones.
- **Autorizacion por rol** con `requireRole`, y verificacion adicional de
  pertenencia: en `iniciarTarjeta`, un cliente solo puede pagar **su** reserva
  (`reserva.id_cliente !== req.usuario.id_cliente` → 403).
- **Rate limiting** aplicado a toda la API, con clave por usuario y no por IP,
  y con razonamiento documentado sobre el falseo de `X-Forwarded-For`.
- **Subida de archivos bien acotada**: 5 MB, tope de archivos, y **filtro por
  mimetype** (imagenes; PDF solo para comprobantes).
- **Sin SQL Injection**: todo el acceso a datos pasa por Prisma.
- **Sin secretos en el repositorio**: `.env` esta en `.gitignore` y existe
  `.env.example`. Los valores reales **no se documentan** aqui.
  `SECRET DETECTADO — NO DOCUMENTAR VALOR` para `POSTGRES_PASSWORD`,
  `JWT_SECRET`, `SMTP_PASS` y `TWILIO_AUTH_TOKEN`.
- **`trust proxy` configurado** (`app.set('trust proxy', 1)`), coherente con
  estar detras de nginx.
