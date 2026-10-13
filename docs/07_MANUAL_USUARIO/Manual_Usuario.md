# Manual de usuario — Total Clean Car

Versión 3.0 · 2026-10-12 (ciudades, empresas, lavado a domicilio, plan VIP y pago antes del lavado) · Reemplaza a la 2.1 (2026-10-08), a la 2.0 (2026-09-27) y a la 1.0 (2026-09-15, "LavadoCarros")

Versión editable en línea: [Manual de usuario — Total Clean Car](https://claude.ai/code/artifact/c6c322fc-329a-4220-afd0-37126360a06f).
Este archivo es la copia versionada para auditoría. Los cambios se registran en
`docs/14_GESTION/Historial_Versiones.md`.

## 1. Introducción

Total Clean Car permite reservar el lavado de un vehículo en su estacionamiento, en
la bahía del taller o a domicilio, en cualquiera de las ciudades donde opera, y
coordina a quienes lo hacen. Cada persona entra con su
usuario y ve solo las pantallas de su rol.

| Rol | Qué hace | Dónde entra al iniciar sesión |
| --- | --- | --- |
| Cliente (persona) | Reserva lavados, paga, sigue el estado y califica; puede tener plan VIP | Mis Reservas |
| Cliente (empresa) | Lo mismo que una persona, pero a crédito con tarifa propia; ve el gasto de su flota | Mis Reservas |
| Lavador | Ve sus trabajos del día, sube fotos y marca el avance | Mis Trabajos |
| Operador | Confirma reservas, asigna lavadores y valida pagos, de su ciudad (o de todo el país) | Dashboard (en el celular, Agenda) |
| Administrador | Todo lo del operador, más el catálogo, los precios y la configuración | Dashboard (en el celular, Agenda) |

Hay tres formas de recibir el servicio:

- **Expreso:** el lavador va al estacionamiento del cliente (edificio, condominio o empresa).
- **A domicilio:** un equipo móvil va a la casa u oficina del cliente, con un recargo según el sector.
- **Limpieza profunda:** el cliente lleva el vehículo a una bahía del taller de su ciudad.

**Todo lavado se paga antes de realizarlo** (sección 4.1). La excepción son las
empresas: se lavan a crédito y pagan con la factura del corte mensual.

Se puede usar de dos formas, con el mismo usuario y los mismos datos:

- **Web:** desde el navegador del computador o del celular.
- **App Android:** instalando la app Total Clean Car (ver sección 2.1).

El precio y la duración de cada servicio dependen del **tipo de vehículo**: moto,
liviano, SUV o camioneta. Por eso lo primero al reservar es elegir el vehículo.

![Figura 1](img/fig01-portada.png)

**Figura 1 — Portada.** Presenta el servicio y el catálogo con el precio por tipo
de vehículo. **Reservar ahora** inicia una reserva; **Ingresar**, arriba a la
derecha, abre el inicio de sesión (con la sesión abierta dice **Mi cuenta**).

## 2. Primeros pasos

Para usar Total Clean Car basta con una cuenta: el cliente la crea solo al hacer su
primera reserva, y el personal recibe la suya del administrador.

### 2.1 Instalar la app Android

1. Reciba el archivo `TotalCleanCar.apk` por el canal que le indique la empresa (correo, WhatsApp o Drive).
2. Ábralo en el teléfono. Si Android lo pide, permita **Instalar apps de origen desconocido** para esa aplicación (correo, navegador o gestor de archivos).
3. Toque **Instalar** y luego **Abrir**. Aparece el ícono de la gota azul con el auto.

La versión actual todavía no está en Google Play; se instala así, a mano.

### 2.2 Crear una cuenta (clientes)

1. En la portada toque **Reservar ahora**.
2. En el primer paso complete nombre, correo, teléfono (opcional) y una contraseña.
3. Toque **Crear cuenta y continuar**. Queda con la sesión iniciada y sigue con la reserva.

El correo es su usuario. Operadores y lavadores no crean cuenta: el administrador se la entrega.

### 2.3 Iniciar sesión

1. Toque **Ingresar** (arriba a la derecha de la portada).
2. Escriba su usuario o correo y su contraseña, y toque **Ingresar**.
3. La app lo lleva a su pantalla de inicio según su rol.

La sesión queda abierta aunque cierre la app o vuelva atrás. Dura 24 horas;
después hay que ingresar de nuevo.

![Figura 2](img/fig02-inicio-sesion.png)

**Figura 2 — Inicio de sesión.** Acepta usuario o correo y contraseña.

### 2.4 Cerrar sesión

Abra el menú (☰ en el celular) y toque el ícono de salida junto a su nombre, abajo
a la izquierda.

### 2.5 Olvidé mi contraseña

Pídale al administrador que la restablezca. Recibirá una contraseña temporal para entrar.

## 3. Cliente: reservar un lavado

Una reserva se arma en seis pasos, como comprar una entrada de cine. La barra de
abajo muestra siempre el total y la duración acumulados; **Siguiente** avanza y el
botón atrás (de la pantalla o del teléfono) vuelve al paso anterior sin perder lo elegido.

1. **Vehículo.** Elija el vehículo que se va a lavar o toque **Registrar otro vehículo**. Al registrarlo, el **tipo** es obligatorio (moto, liviano, SUV o camioneta) y la placa también; marca, modelo y color son opcionales. Si un vehículo antiguo aparece sin tipo, elija el tipo ahí mismo.
2. **Servicio.** Se muestran los servicios con el precio y la duración para ese tipo de vehículo. Los que no se ofrecen para ese tipo aparecen apagados con la nota "No disponible para …".
3. **Adicionales.** Opcional. Marque los extras que quiera (por ejemplo, un encerado); cada uno suma su precio y sus minutos. Si no quiere ninguno, toque **Omitir**.
4. **Lugar.** Primero la **ciudad** (el teléfono la recuerda para la próxima vez). Para un servicio expreso, elija el estacionamiento donde está el vehículo o **A domicilio** (ver 3.1). La limpieza profunda se hace en el taller de esa ciudad y no pide lugar.
5. **Función (día y hora).** Elija el día en la tira de fechas (hasta dos semanas; con plan VIP, los días que dé su plan) y luego la hora. Cada horario muestra los cupos que quedan; los agotados aparecen tachados y los de hoy que ya pasaron no se muestran.
6. **Boleto.** Revise el resumen: vehículo, lugar, servicio, adicionales y total. Toque **Confirmar reserva**.

| | |
|---|---|
| ![Figura 3](img/fig03-reserva-vehiculo.png) | ![Figura 4](img/fig04-reserva-servicio.png) |
| **Figura 3 — Paso 1, vehículo.** | **Figura 4 — Paso 2, servicios para una moto.** Solo uno se ofrece para ese tipo. |
| ![Figura 5](img/fig05-reserva-adicionales.png) | ![Figura 6](img/fig06-reserva-funcion.png) |
| **Figura 5 — Paso 3, adicionales.** | **Figura 6 — Paso 5, día y hora con los cupos disponibles.** |

![Figura 7](img/fig07-reserva-boleto.png)

**Figura 7 — Paso 6, boleto.** Resumen con el precio del servicio, cada adicional y el total.

Al confirmar aparece el boleto con el **código de reserva** (por ejemplo
`RES-2026-00034`) y llega un correo de recepción. La reserva queda **solicitada**
hasta que el operador la confirma. El boleto recuerda que **el lavado se paga antes
de realizarlo**: transfiera y suba el comprobante desde Mis Reservas (sección 4.1).

**Si su edificio tiene un plan contratado**, el servicio principal puede salir sin
costo; los adicionales se cobran siempre. El total final se ve al confirmar.

**Si tiene plan VIP** (sección 4.5), el boleto muestra el precio tachado y lo que
paga con su plan: "Incluido en tu plan" mientras le queden lavados del mes, o el
descuento cuando ya los usó.

### 3.1 Lavado a domicilio

En el paso **Lugar**, toque **A domicilio** y complete:

- **Sector:** elija el suyo de la lista. Debajo se ve el **recargo por visita** de ese sector. Si su zona no aparece, todavía no llegamos ahí.
- **Dirección** y **referencia** (por ejemplo "portón negro, junto a la farmacia").
- **Quién recibe al equipo** y un **teléfono de contacto**.
- **Usar mi ubicación** es opcional y ayuda al equipo a encontrarlo; basta con la dirección.

**El agua y la luz las pone usted.** Sin ellas no se puede lavar y la visita se
cobra igual. Lo mismo si el vehículo no está o no hay acceso al lugar.

El equipo sale a su dirección antes de la hora elegida. En Mis Reservas la tarjeta
dice **"Nuestro equipo va en camino"** cuando sale. Si no se pudo lavar, la reserva
queda como **visita fallida** con el motivo, y se cobra el cargo de visita.

**Si al confirmar aparece "Franja no disponible"**, otra persona tomó el último
cupo en ese momento: vuelva al paso 5 y elija otra hora.

## 4. Cliente: seguir, pagar y calificar

Todas sus reservas están en **Mis Reservas**, cada una con su código, servicio,
adicionales, vehículo, fecha, hora, lugar y total.

![Figura 8](img/fig08-mis-reservas.png)

**Figura 8 — Mis Reservas.** Cada tarjeta ofrece las acciones que corresponden a su estado.

![Figura 9](img/fig09-estados-reserva.png)

**Figura 9 — Estados de una reserva.** Una reserva solo se puede cancelar antes de que empiece el lavado.

Cada cambio de estado queda en el **Historial** de la reserva (botón **Detalle**),
y llega un correo cuando se confirma y cuando se completa. Si la empresa activó los
mensajes, el día anterior también llega un recordatorio por WhatsApp o SMS al
teléfono registrado.

### 4.1 Pagar antes del lavado (transferencia)

**El lavado se realiza cuando el pago está confirmado.** Mientras falte, la tarjeta
dice *"Paga $X antes del lavado: lo realizamos cuando el pago esté confirmado"* y el
lavador no puede empezar. Un comprobante "en verificación" todavía no cuenta: tiene
que aprobarlo el operador, así que pague con tiempo, idealmente apenas reserve.

Lo que sale en $0 (por su plan VIP o el plan de su edificio) no necesita pago.

1. Transfiera el total a la cuenta que le indique la empresa.
2. En la reserva toque **Pagar** y adjunte el comprobante, el monto y, si lo tiene, el número de transferencia.
3. Toque **Enviar comprobante**. La tarjeta muestra "en verificación" hasta que el operador lo aprueba.

El comprobante es **un solo archivo** de hasta **5 MB**: imagen (JPG, PNG, WEBP o
GIF) o PDF. Si el operador no puede validarlo, la reserva avisa que el comprobante
fue rechazado y puede enviar otro. También se puede pagar en efectivo en la
oficina o al operador, que lo registra antes de que empiece el lavado.

El pago con tarjeta todavía no está disponible: la pasarela de pagos no está conectada.

### 4.2 Cancelar

Toque **Cancelar** en la reserva y confirme. Solo se puede mientras está
solicitada o confirmada; una vez iniciado el lavado ya no. Si ya había pagado,
pida la devolución al operador con el código de la reserva. Si era un lavado
incluido en su plan VIP, el lavado vuelve a su cupo del mes.

### 4.3 Ver la evidencia y descargar el acta

- **Evidencia:** fotos de antes y después que subió el lavador.
- **Acta:** PDF con los datos del servicio, las fotos, los pagos y la calificación. En la app Android se abre el menú de compartir para guardarla o enviarla.

### 4.4 Calificar

Cuando el lavado está completado aparece **Calificar**. Elija de 1 a 5 estrellas
y, si quiere, deje un comentario. Cada reserva se califica una sola vez.

### 4.5 Plan VIP (personas)

Un plan VIP se paga cada mes y da, según el plan:

- **Lavados incluidos al mes**, que salen en $0.
- **Descuento** en los lavados que pasen de ese número y en los adicionales.
- **Prioridad:** reservar con más días de anticipación y, si la empresa lo activa, horarios apartados para VIP.

Para suscribirse:

1. En el menú abra **Mi plan VIP**, elija un plan y toque **Quiero este plan**.
2. Transfiera el valor del mes y, en **Mensualidades**, toque **Subir comprobante**.
3. Cuando el operador aprueba el pago, el plan aparece **activo este mes**.

**Los beneficios rigen solo en los meses pagados.** Cada mes aparece una nueva
mensualidad pendiente; mientras no esté aprobada, el plan dice "sin pagar este mes"
y las reservas de ese mes se cobran a precio normal. En la misma pantalla se ve
cuántos lavados le quedan del mes; el cupo se reinicia el día 1.

**Cancelar mi plan:** lo ya pagado del mes se respeta; desde el mes siguiente deja
de cobrarse. Las cuentas de empresa no tienen plan VIP.

### 4.6 Cuentas de empresa

Si su cuenta es de una empresa, la crea el administrador y la maneja una sola
persona (el gestor de la flota). Reserva igual que una persona (sección 3), con
estas diferencias:

- **No paga al reservar.** El boleto dice "A crédito, con la tarifa de tu empresa". Todo se factura en el **corte mensual**.
- **Precios pactados:** se ven los de su empresa, no los de lista.
- Si su empresa tiene **parqueadero propio**, aparece en el paso Lugar como "Parqueadero de tu empresa".

En **Mi flota** el gestor ve:

- **Gasto del mes** (lavados completados, a su tarifa) y lo **pendiente de facturar**.
- **Por vehículo:** cuántos lavados tuvo cada uno en el mes, con flechas para ver meses anteriores.
- **Cortes mensuales:** cada factura con su estado (cerrado, facturado, pagado), el número de factura y el botón **Excel** con el detalle lavado por lavado.

## 5. Lavador: mis trabajos

El lavador ve en **Mis Trabajos** solo las reservas que el operador le asignó, con
el servicio, los adicionales que debe hacer, el vehículo (placa, tipo, marca y
modelo), la hora y el lugar. Arriba puede cambiar la fecha para ver otro día.

![Figura 10](img/fig10-mis-trabajos.png)

**Figura 10 — Mis Trabajos.** Tarjeta de un trabajo confirmado, lista para iniciar.

**Revise siempre los adicionales:** aparecen en azul debajo del servicio (por
ejemplo "+ Encerado express") y son parte del trabajo que el cliente pagó.

Con cada trabajo:

1. Al llegar, abra **Evidencia** y suba las fotos de **antes**. En el celular puede tomarlas con la cámara o elegirlas de la galería. Se admiten hasta 6 imágenes (JPG, PNG, WEBP o GIF) de 5 MB por vez.
2. Toque **Iniciar**. La reserva pasa a "en proceso" y el cliente lo ve.
3. Al terminar, suba las fotos de **después**.
4. Escriba en la descripción lo que hizo o lo que observó (una mancha que no salió, un rayado previo) y toque **Guardar descripción**. Esa nota sale en el acta que recibe el cliente.
5. Toque **Completar**. El cliente recibe el aviso y puede calificar.

**Iniciar** solo aparece cuando la reserva está confirmada, y **Completar** cuando
está en proceso.

**No inicie un lavado sin pagar.** Si la tarjeta dice *"Falta el pago de $X: el
lavado se paga antes de hacerlo"*, el sistema no lo deja iniciar. Pida al cliente
que pague (o avise al operador para que registre el efectivo). Las reservas de
empresas no muestran este aviso: van a crédito. Si un trabajo no aparece o el cliente no está, avise al operador:
él reasigna el trabajo o cancela la reserva.

El lavador también puede ver la **Agenda** del día para saber qué más está programado.

### 5.1 Equipo a domicilio

Las reservas a domicilio traen la dirección, la referencia, quién recibe y su
teléfono, y estos botones:

| Botón | Cuándo | Qué hace |
| --- | --- | --- |
| Mapa | Siempre | Abre la dirección en el mapa del celular |
| Salí | Al salir hacia la dirección | Avisa al cliente que el equipo va en camino. No se puede si falta el pago |
| Llegué | Al llegar | Registra la llegada (con la ubicación del celular, si la da) |
| No se pudo lavar | Si no se puede hacer el trabajo | Pide el motivo y cierra la visita como fallida |

Para **No se pudo lavar**, escriba el número de un motivo de la lista (no había
acceso al lugar, no había toma de agua o de luz, el vehículo no estaba, el cliente
canceló en el sitio, lluvia) o escriba otro, y confirme. La visita fallida se cobra al cliente. Después de **Llegué**, el trabajo
sigue como cualquier otro: fotos, **Iniciar**, descripción y **Completar**.

En la web, la ubicación del celular todavía no se registra (el navegador la exige
con conexión segura HTTPS); la llegada queda registrada sin GPS.

## 6. Operador y administrador: el día a día

El trabajo diario es confirmar cada reserva nueva, asignarle un lavador y validar
los pagos. Todo se hace desde el menú de la izquierda (☰ en el celular).

**Ciudades.** Un operador con ciudad asignada ve y maneja solo lo de su ciudad. El
operador nacional y el administrador ven todo el país y tienen arriba el selector
**Todo el país / ciudad** para mirar una sola. Todo lo de ciudades, empresas,
lavado a domicilio, planes VIP y la regla de pago se configura según el **Manual
de administrador** (secciones 1.2 a 1.6).

### 6.1 Dashboard

Cómo va el negocio **ahora**. Se abre y se lee: no hay nada que configurar.

Arriba, cinco tarjetas: lavados de hoy, lavados del mes (con los de la semana
debajo), cobrado del mes, ocupación de hoy y calificación promedio.

Si hay solicitudes sin confirmar aparece un aviso ámbar; al hacerle clic se abre
Reservas ya filtrada por esas solicitudes.

Abajo, dos gráficas de los **últimos 30 días**:

- **Ingresos por día** — cuánto se facturó cada día.
- **Lavados por servicio** — cuáles se piden más. Debajo, la misma información en
  una tabla con los números exactos.

Las dos cubren el mismo período, así que se pueden leer juntas: cuánto entró y de
qué servicios vino.

> Para mirar un mes anterior, comparar o exportar, eso está en **Reportes**
> (sección 6.6). El Dashboard siempre muestra el presente.

### 6.2 Agenda

Muestra todo lo ocupado en un día y la capacidad (lavados expreso simultáneos y
bahías de limpieza profunda). Para cerrar un horario por mantenimiento o un
imprevisto, use **Bloquear franja manualmente**: elija dónde (un sitio, toda la
ciudad o, para el alcance nacional, todo el país), indique inicio, fin y motivo, y
toque **Bloquear**. Ese horario deja de ofrecerse solo donde se bloqueó; cada
bloqueo de la lista dice su alcance. Bloquear todo el país pide confirmación.

### 6.3 Reservas

Lista filtrable por fecha, estado y modalidad. Cada fila muestra servicio,
adicionales, cliente, placa y tipo de vehículo, horario, lavador y estado de pago.

![Figura 11](img/fig11-reservas-panel.png)

**Figura 11 — Reservas.** Los botones de acción de cada fila, a la derecha.

| Botón | Qué hace | Cuándo aparece |
| --- | --- | --- |
| Confirmar | Acepta la reserva y avisa al cliente | Solicitada |
| Asignar lavador | Elige quién la hace; rechaza si ese lavador ya tiene otro trabajo a la misma hora | Solicitada, confirmada o en proceso |
| Iniciar / Completar | Lo mismo que hace el lavador, por si no tiene el celular a mano | Confirmada / en proceso |
| Cancelar | Cancela y libera el horario | Solicitada o confirmada |
| Pagos | Registra un pago en efectivo o transferencia, con comprobante, o aprueba uno enviado | Salvo en canceladas |
| Evidencia | Ve o sube fotos y la descripción del trabajo | En proceso o completada |
| Acta | Descarga el PDF del servicio | Siempre |

La columna de pago dice **sin pagar**, **pagado $X** o **✓ pagado**. Con la regla
de pago anticipado, **Iniciar** se rechaza mientras quede saldo: registre el
efectivo o apruebe el comprobante primero. Las reservas de empresas (a crédito)
no tienen esa exigencia.

El estado "No asistió" existe, pero el panel todavía no tiene un botón para
marcarlo: si el cliente no está, cancele la reserva.

### 6.4 Nueva reserva para un cliente

Para quien llama por teléfono o llega sin reserva: en **Reservas** toque **Nueva
reserva**. Es la única forma de que el personal reserve: el menú "Nueva Reserva" es
solo para clientes.

1. Busque al cliente por nombre, correo o cédula. Si no existe, regístrelo primero en **Clientes**.
2. Elija su vehículo o registre uno nuevo, con su tipo. Si el vehículo no tiene tipo, el formulario lo pide.
3. Elija el servicio (cada uno muestra el precio para ese tipo de vehículo), los adicionales, el estacionamiento —o **a domicilio**, con sector y dirección— y la fecha.
4. Toque un horario libre y **Registrar reserva**. Se muestra el código y el total.

### 6.5 Pagos por verificar

Aquí llegan los comprobantes que envían los clientes, de reservas y de
mensualidades VIP; el menú muestra cuántos hay pendientes. **Revíselos pronto:**
como el lavado se paga antes, un comprobante sin aprobar detiene el trabajo. Revise la imagen o el PDF contra la cuenta bancaria y toque **Aprobar
pago** o **Rechazar** (con el motivo). Un comprobante no cuenta como ingreso hasta
que se aprueba.

![Figura 12](img/fig12-pagos-por-verificar.png)

**Figura 12 — Pagos por verificar.**

### 6.6 Reportes

Lo que el Dashboard no hace: **mirar un mes a elegir**.

Arriba de todo está el selector. Las flechas `‹` y `›` se mueven de a un mes; el
campo de mes salta a uno lejano. No se puede elegir un mes que todavía no pasó, y
el mes en curso llega hasta hoy. Todo lo de abajo —tarjetas, gráficas y lo que se
exporta— cambia con el mes elegido.

**Las tarjetas del mes:** lavados, facturado, cobrado, ticket promedio,
cancelados y calificación.

**Facturado y cobrado casi nunca son iguales, y está bien:**

- **Facturado** es lo que suman los lavados **hechos** en el mes.
- **Cobrado** son los **pagos aprobados** con fecha dentro del mes.

Un lavado del 28 de septiembre que el cliente pagó el 2 de octubre factura en
septiembre y cobra en octubre. Cuando los dos números difieren, la pantalla lo
explica abajo de las tarjetas.

**Las gráficas:** ingresos por día del mes, lavados por servicio y lavados por
estacionamiento. Cada una tiene debajo una tabla con los nombres completos y los
números exactos — útil cuando un nombre es largo y en la gráfica aparece cortado.

**Exportar.** Los botones **Excel** y **PDF** de arriba a la derecha generan el
archivo **del mes que está en pantalla**, no de todo el historial. El nombre del
archivo lleva el mes (`total-clean-car-2026-09.xlsx`).

## 7. Administrador: catálogo y configuración

Lo que se ofrece y cuánto cuesta se define en **Servicios**; quién y dónde se
trabaja, en Clientes, Lavadores y Estacionamientos. Nada se borra: se
**desactiva**, y así las reservas y los reportes anteriores quedan intactos.

### 7.1 Servicios y precios

Cada servicio tiene una tabla con el precio y la duración para cada tipo de vehículo.

1. En **Servicios → Servicios y precios**, toque el lápiz de un servicio (o complete **Nuevo servicio**).
2. Marque los tipos de vehículo a los que se ofrece y escriba su precio y sus minutos. Un tipo sin marcar no ve ese servicio.
3. Toque **Guardar cambios**.

![Figura 13](img/fig13-servicios-precios.png)

**Figura 13 — Servicios y precios.** A la izquierda el formulario, a la derecha la
tabla de precios por tipo de vehículo ("—" = no se ofrece).

La duración importa: define cuánto tiempo se bloquea en la agenda. Un cambio de
precio vale para las reservas nuevas; las ya hechas conservan su precio.

**Pendiente al 27/09/2026:** las motos todavía no tienen ningún precio cargado, así
que no pueden reservar hasta que se carguen.

### 7.2 Adicionales

En **Servicios → Adicionales** se crean los extras (nombre, precio y minutos
extra). Aparecen en el paso "¿Algo más?" de la reserva. Los planes de edificio no
los cubren.

### 7.3 Tipos de vehículo

En **Servicios → Tipos de vehículo** están moto, liviano, SUV y camioneta. Se
pueden crear otros (por ejemplo, van) y después asignarles precios en la primera
pestaña. Desactivar un tipo impide registrar vehículos nuevos de ese tipo y
reservar con los existentes.

### 7.4 Clientes

El operador registra clientes. Solo el administrador puede **crear el acceso** de
un cliente o **restablecer su contraseña**: el sistema genera una contraseña
temporal que se muestra una sola vez, para entregársela al cliente. Suspender a un
cliente le impide ingresar y reservar.

### 7.5 Lavadores

Cree cada lavador con **Nuevo lavador**, su **ciudad** y su **cuenta de acceso**
para que vea Mis Trabajos. La cantidad de lavadores activos **de la ciudad** es la
capacidad de servicios expreso en los sitios que no tienen una capacidad propia. Los
lavadores que forman parte de un equipo a domicilio no cuentan para el expreso.

### 7.6 Estacionamientos

Cada sitio tiene ciudad, tipo (**aliado**: estacionamiento de edificio o
condominio; **taller**: bahías de limpieza profunda, uno por ciudad; **privado**: el
parqueadero propio de una empresa), dirección, horario de apertura y cierre, y en
**Configurar agenda**:

- **Capacidad expreso:** lavados simultáneos en ese sitio (0 = la cantidad de lavadores activos).
- **Granularidad:** cada cuánto empiezan los horarios (60 minutos por defecto).

El **Mapa de plazas** registra los puestos y las bahías de lavado. Las bahías
disponibles son la capacidad de la limpieza profunda.

### 7.7 Planes para edificios y VIP

Un plan cubre una cantidad de lavados al mes para todos los residentes de un sitio.
Cree el plan (precio mensual, lavados incluidos, modalidad) y asígnelo al
estacionamiento. Mientras quede cupo, el servicio principal de cada reserva en ese
sitio sale en $0. El cupo se reinicia el día 1 de cada mes.

Los **planes VIP** (pestaña VIP de **Planes**) son personales: precio mensual,
lavados incluidos, descuento y días de anticipación. Las mensualidades se generan y
se aprueban desde ahí; el detalle está en el Manual de administrador, sección 1.5.

### 7.8 Reportes

Ingresos de los últimos 30 días, lavados por servicio y por sitio, y el detalle
lavado por lavado. Se exportan a **Excel** o **PDF**.

## 8. Preguntas frecuentes y problemas

| Situación | Qué hacer |
| --- | --- |
| Un servicio aparece "No disponible para moto" (u otro tipo) | Ese servicio no se ofrece para ese tipo de vehículo. Elija otro, o pida al administrador que le cargue un precio para ese tipo. |
| No puedo elegir mi vehículo | Le falta el tipo. Elija moto, liviano, SUV o camioneta en la misma tarjeta y queda habilitado. |
| No aparecen horarios para hoy | Ya pasaron o están agotados. Elija otro día en la tira de fechas. |
| Al confirmar dice "Franja no disponible" | Otra persona tomó el último cupo en ese instante. Vuelva al paso anterior y elija otra hora. |
| Me pide iniciar sesión otra vez | La sesión dura 24 horas. Ingrese de nuevo con su usuario y contraseña. |
| Olvidé mi contraseña | El administrador la restablece y le entrega una temporal. |
| Envié el comprobante y sigue "en verificación" | El operador todavía no lo revisó. Si lo rechaza, la reserva lo indica y puede enviar otro. |
| El comprobante no sube | Revise que sea un solo archivo, de menos de 5 MB, en imagen o PDF. |
| No me llegan los correos | Revise la carpeta de spam. Todo lo que dice el correo también está en Mis Reservas. |
| El lavador no puede tocar "Iniciar" | La reserva aún no está confirmada, o falta el pago. El operador debe confirmarla y el pago debe estar aprobado. |
| Pagué y el lavado no empieza | El comprobante sigue "en verificación". Hasta que el operador lo aprueba no cuenta como pagado. |
| No aparece la opción A domicilio | En su ciudad todavía no hay sectores con equipo móvil, o el servicio elegido no es expreso. |
| Mi sector no está en la lista | Todavía no llegamos a esa zona. Puede reservar en un estacionamiento o en el taller. |
| No veo días más allá de dos semanas | Es el límite general. Con plan VIP se amplía a los días de su plan, si el mes está pagado. |
| Tengo plan VIP y me cobran precio normal | La mensualidad de ese mes no está aprobada todavía, o la reserva es de un mes que aún no pagó. |
| Soy empresa y no veo "Pagar" | Es correcto: las empresas pagan con la factura del corte mensual. |
| No puedo cancelar | Una vez iniciado el lavado ya no se cancela desde la app. Comuníquese con la empresa. |
| La app no abre o dice "Error de conexión con el servidor" | Revise que el teléfono tenga internet (datos o wifi) y vuelva a intentar. Si sigue, avise al soporte. |
| La web muestra una versión vieja | Cierre la pestaña o la app instalada y vuelva a abrirla. |

Para cualquier otro problema, avise al operador o al administrador con el **código
de la reserva** (por ejemplo `RES-2026-00034`): con él encuentran todo el historial.

## 9. Mensajes del sistema

| Mensaje | Significa | Qué hacer |
| --- | --- | --- |
| Token inválido o expirado | La sesión caducó | Iniciar sesión de nuevo |
| La cuenta está suspendida | Un administrador la desactivó | Pedir la reactivación |
| Acceso denegado | La opción no corresponde a su rol | Pedir el permiso a un administrador |
| Demasiados intentos / Demasiadas solicitudes | Límite de seguridad alcanzado | Esperar unos minutos |
| Ese horario ya pasó. Elija uno más tarde. | La hora elegida ya empezó | Elegir otra hora |
| El servicio dura N min y no cabe en el horario de atención | Con los adicionales, el servicio termina después del cierre | Elegir una hora más temprana o quitar adicionales |
| "…" no está disponible para este tipo de vehículo | El servicio no se ofrece a ese tipo | Elegir otro servicio |
| El vehículo no tiene tipo registrado | Vehículo anterior al catálogo de tipos | Elegir su tipo en la tarjeta del vehículo |
| Esta reserva no tiene saldo pendiente | Ya está pagada | No hace falta pagar |
| No se puede iniciar el lavado: falta el pago de $X | La reserva tiene saldo | Pagar o aprobar el comprobante, y luego iniciar |
| Paga $X antes del lavado | Recordatorio en Mis Reservas | Transferir y subir el comprobante |
| Nuestro equipo va en camino | El equipo a domicilio salió | Tener listos el vehículo, el agua y la luz |
| No pudimos lavar en la visita | La visita a domicilio falló | Ver el motivo; se cobra el cargo de visita |

---

*Capturas tomadas el 2026-09-27 de la versión en producción y del entorno de
prueba, solo con datos de demostración. Las pantallas nuevas del 2026-10-12
(ciudad, a domicilio, Mi plan VIP, Mi flota) todavía no tienen captura.*
