# Preparación para la APK — Total Clean Car

*2026-09-27. Solo preparación: no se instaló Capacitor ni se compiló nada.*

## Veredicto

**El código está listo para empaquetarse. La infraestructura todavía no.**

La app es una PWA en React, responsive y pensada para el celular. Se puede envolver
en una APK sin reescribirla. Lo que falta antes de compilar no es código: es tener
el servidor publicado con **dominio y HTTPS**.

| Área | Estado |
|---|---|
| Interfaz para el celular (flujo de reserva, barra inferior, zonas seguras) | ✅ Lista |
| Botón "atrás" de Android dentro del flujo de reserva | ✅ Cada paso vive en la URL |
| Sesión persistente (no se pierde al volver atrás ni al reabrir la app) | ✅ Corregido |
| Íconos, splash e identidad Total Clean Car | ✅ `frontend/resources/` |
| URLs de API y archivos configurables para la APK | ✅ `REACT_APP_SERVIDOR` |
| CORS restringible a los orígenes de la app | ✅ `CORS_ORIGINS` |
| Service worker desactivado dentro de la app nativa | ✅ |
| **Dominio público con HTTPS** | ❌ **Bloqueante** |
| Descarga de PDF/Excel dentro de la app | ⚠️ Necesita un plugin al compilar |
| Respaldo de la base (CONT-01 de la auditoría) | ❌ Recomendado antes de abrir a clientes |

## Estado: APK de prueba compilada (2026-09-27)

`/home/server-dt/apk/TotalCleanCar-1.0-prueba.apk` (6,9 MB, `versionName 1.0`).

- **Firmada con la clave de depuración de Android**: se instala a mano, pero **no
  sirve para Google Play**. Para publicar hace falta un keystore propio (ver abajo).
- **Servidor: `http://181.188.232.50:3041`, sin cifrar**, por decisión del usuario
  mientras no haya dominio. Contraseñas y comprobantes viajan en claro por internet.
- El HTTP sin cifrar se permite **solo** hacia esa IP y `localhost`
  (`android/app/src/main/res/xml/network_security_config.xml`); el resto exige HTTPS.
- La app carga en `http://localhost` (`androidScheme: "http"`). Con `https`,
  Android bloquearía las llamadas http:// a la API como contenido mixto.
- Ya resueltos en esta versión: botón atrás de Android (`src/index.tsx`) y
  descargas de PDF/Excel con el menú de compartir (`services/descargas.ts`).

**Al pasar a HTTPS con dominio:** cambiar `REACT_APP_SERVIDOR`, volver
`androidScheme` a `"https"`, quitar los `domain-config` del
`network_security_config.xml` y agregar el dominio a `CORS_ORIGINS`. Cambiar el
esquema cambia el origen de la app: los usuarios tendrán que iniciar sesión otra vez.

### Recompilar

    cd frontend
    sudo -u server-dt -H env REACT_APP_SERVIDOR=http://181.188.232.50:3041 CI=false npm run build
    sudo -u server-dt -H npx cap sync android
    cd android
    sudo -u server-dt -H env JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
      ANDROID_HOME=/home/server-dt/android-sdk ./gradlew assembleDebug
    # -> android/app/build/outputs/apk/debug/app-debug.apk

La URL va en la línea de comandos, **no** en un `.env.production.local`: el build
web del Dockerfile la heredaría y la página web llamaría a la IP en vez de a `/api`.

## Roles en la APK (decidido el 2026-09-27)

**Una sola APK para todos los roles.** Es la misma app web: cada usuario ve las
pantallas de su rol al iniciar sesión.

| Rol | Uso principal en la APK |
|---|---|
| Cliente | Reservar, seguir sus reservas, subir el comprobante y calificar |
| Lavador | Mis trabajos: iniciar, completar y subir fotos con la cámara |
| Operador / Admin | Consulta rápida del panel. **Arranca en la Agenda**, no en el Dashboard |

El trabajo diario de operador y admin (tablas, reportes, Excel) sigue en la web,
en computadora. La pantalla de inicio la decide `rutaInicio()` en
`context/AuthContext.tsx`: en la APK o en una pantalla de menos de 768 px lleva a
`/agenda`, y en computadora a `/dashboard`.

## Enfoque recomendado: Capacitor

Capacitor mete el build de React (`frontend/build`) dentro de una app Android. La
app corre desde el propio teléfono y habla con la API por internet.

La otra opción es una TWA (Trusted Web Activity), que abre el sitio web dentro de
una app. También exige HTTPS con dominio, pero depende de la red para todo y da
menos control sobre la cámara y las descargas. Capacitor es la vía más flexible,
y el servidor ya tiene el toolchain de Android instalado.

## Bloqueantes (resolver antes de compilar)

### 1. HTTPS con dominio público

Android bloquea por defecto las conexiones HTTP sin cifrar. Hoy la app se publica
en `http://<ip>:3041`: eso no sirve para la APK. Además, por la API viajan
contraseñas y comprobantes de pago.

Se necesita:

- un dominio (por ejemplo `app.totalcleancar.com`) que apunte al servidor;
- un proxy con certificado, por ejemplo Caddy o nginx con Let's Encrypt, que
  reenvíe a `127.0.0.1:3041`.

Eso también resuelve el pendiente SEC-03 de la auditoría (API y Swagger expuestos
sin cifrado).

### 2. CORS

La app nativa corre en el origen `https://localhost`. En el `.env` del servidor:

    CORS_ORIGINS=https://app.totalcleancar.com,https://localhost

### 3. Identificador de la app (decisión que no se puede deshacer)

`capacitor.config.json` propone `com.totalpacificgroup.totalcleancar`. Una vez
publicada en Google Play **no se puede cambiar**. Confirmarlo antes de la primera
compilación de release.

### 4. Keystore propio

La APK de release se firma con un keystore. Tiene que ser **uno nuevo para esta
app**, no el de la app de guardias. Si se pierde, no se pueden publicar
actualizaciones. Guardarlo fuera del repositorio y con respaldo.

## Lo que ya quedó hecho en el código

| Archivo | Qué hace |
|---|---|
| `frontend/capacitor.config.json` | Nombre, id, `webDir: build`, esquema https y splash con el azul de marca |
| `frontend/resources/` | `icon-only`, `icon-foreground` y `icon-background` (ícono adaptativo), `splash`, `splash-dark`. Generados desde `docs/lavadodecarro.png` |
| `frontend/.env.apk.example` | Plantilla con `REACT_APP_SERVIDOR` para compilar el frontend de la APK |
| `frontend/src/services/config.ts` | `SERVIDOR`, `API_URL`, `urlArchivo()` y `esAppNativa()` |
| Fotos y comprobantes | Usan `urlArchivo()`. En la web no cambia nada; en la APK apuntan al servidor |
| `serviceWorkerRegistration.ts` | No registra el service worker dentro de la app nativa |
| `backend/src/index.js` | CORS configurable con `CORS_ORIGINS` |
| `pages/Reservar.tsx` | El paso va en `?paso=N`, así el botón atrás de Android retrocede un paso |
| `pages/Login.tsx` | Con la sesión abierta no muestra el formulario; el login no queda en el historial |

## Pendientes que aparecen al compilar

1. **Descargas (acta PDF y reportes).** `services/descargas.ts` usa un blob con
   `<a download>`, y eso no funciona en el WebView de Android. Con
   `@capacitor/filesystem` y `@capacitor/share` se guarda el archivo y se abre el
   menú de compartir. Se hace en `descargarArchivo()` usando `esAppNativa()`, que
   ya existe.
2. **Botón atrás del sistema.** Con `@capacitor/app`: `backButton` hace
   `history.back()`, y en la pantalla inicial minimiza la app.
3. **Cámara para la evidencia.** Los `<input type="file" accept="image/*">`
   funcionan en el WebView. Hay que probar en un dispositivo que el lavador pueda
   elegir entre cámara y galería, y declarar el permiso de cámara si Android lo pide.
4. **Duración de la sesión.** `JWT_EXPIRES_IN=24h` obliga a iniciar sesión cada
   día. En una app es incómodo; se puede evaluar un token más largo o un token de
   renovación. Es una decisión de seguridad, no un bug.

## Cómo se compilaría (cuando se decida)

    cd frontend
    cp .env.apk.example .env.production.local     # y poner el dominio real
    npm install @capacitor/core @capacitor/android @capacitor/app \
                @capacitor/filesystem @capacitor/share @capacitor/splash-screen
    npm install -D @capacitor/cli @capacitor/assets
    npm run build
    npx cap add android
    npx cap sync android
    npx @capacitor/assets generate --android       # usa frontend/resources/
    cd android
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
    ANDROID_HOME=/home/server-dt/android-sdk \
    ./gradlew assembleDebug                       # para pruebas; release requiere el keystore

El toolchain (JDK 21 y SDK en `/home/server-dt/android-sdk`) ya está en el
servidor; ver `AGENTS.md` de totalsecureapp, sección "El toolchain de compilacion".

## Pruebas en el dispositivo

- [ ] Registro de cliente y registro de vehículo (incluida moto)
- [ ] Reserva completa: vehículo → servicio → adicionales → lugar → función → boleto
- [ ] Botón atrás de Android en cada paso: retrocede sin cerrar la app
- [ ] Cerrar y reabrir la app: la sesión sigue abierta
- [ ] Fechas: la reserva aparece el mismo día elegido, también de noche (después de las 19:00)
- [ ] Lavador: subir fotos con la cámara
- [ ] Cliente: subir comprobante de transferencia
- [ ] Descargar el acta PDF (con el plugin del pendiente 1)
- [ ] Sin conexión: mensaje de error claro, sin pantalla en blanco
