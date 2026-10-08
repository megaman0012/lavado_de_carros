# Backup y recuperacion

Version 2.0 · 2026-10-08 — cierra el item #17 del plan de trabajo. La version 1.0
(2026-09-15) documentaba que **no existia ningun respaldo**; el estado de aquel
dia se conserva al final, en "Antes del 2026-10-08".

## Estado actual: 🟢 RESPALDO AUTOMATICO DIARIO

| | |
|---|---|
| Script | `scripts/respaldo.sh` |
| Cron | diario a las **03:30** (`crontab -l` del usuario `server-dt`) |
| Destino | `~/respaldos/lavado_de_carros/` (permisos 700; cada paquete, 600) |
| Retencion | 30 diarios + 12 mensuales (los del dia 1 de cada mes) |
| Log | `~/respaldos/lavado_de_carros/log/respaldo.log` y `log/cron.log` |
| Probado restaurando | **si**, 2026-10-08 — ver "Validacion" |

El horario se eligio para no pisar los otros dos respaldos del servidor: TPSD
corre los domingos a las 02:00 y Total Secure App todos los dias a las 03:00.

## Que se respalda

| Elemento | Donde | Como |
|---|---|---|
| Base de datos | volumen `lavado_de_carros_postgres_data` | `pg_dump -Fc` dentro del paquete |
| Evidencias y comprobantes | volumen `lavado_de_carros_uploads_data` | **espejo incremental** en `uploads/` |
| `.env` (secretos) | archivo local, no versionado | dentro del paquete |
| `docker-compose.yml`, `nginx.conf` | versionados | dentro del paquete, para que sea autosuficiente |
| Commit y migraciones aplicadas | — | `repo/estado.txt` dentro del paquete |
| Codigo | GitHub | **no se respalda**: ya esta en el remoto |

Dos decisiones que conviene entender:

**Los archivos subidos NO van dentro del .tar.gz.** Hoy pesan menos de 1 MB, pero
cada lavado suma hasta 6 fotos: en un año serian gigas, y meterlos en cada
paquete multiplicaria eso por los 30 dias de retencion. Van a un espejo que solo
crece, en `~/respaldos/lavado_de_carros/uploads/`.

**El espejo no borra.** Si alguien elimina evidencia del servidor —por error o
no— el espejo la conserva. Esa es la diferencia entre un respaldo y un espejo, y
es a proposito: la evidencia fotografica y los comprobantes son el respaldo
documental del servicio prestado y del cobro.

**Se guarda a que commit correspondian los datos.** El codigo esta en GitHub, pero
lo que no se puede reconstruir despues es que version estaba corriendo cuando se
tomo el respaldo. Restaurar una base en un esquema distinto es adivinar.

## Uso

```bash
cd /home/server-dt/Documentos/lavado_de_carros

./scripts/respaldo.sh                  # respaldo completo (lo que corre el cron)
./scripts/respaldo.sh --solo-verificar # estado de los respaldos, sin generar nada
```

`--solo-verificar` es lo que conviene mirar cada tanto: dice cuantos paquetes
hay, cuanto pesan y **cuantos dias tiene el mas reciente**. Si pasan mas de dos
dias, avisa — es la señal de que el cron dejo de correr.

Ningun paso aborta el script: si uno falla se registra y se intentan los demas,
para no perder todo el respaldo por una falla parcial. El codigo de salida es
`1` si algo fallo, asi que el cron deja rastro en `cron.log`.

### Variables opcionales

| Variable | Para que | Por defecto |
|---|---|---|
| `DIR_RESPALDOS` | donde guardar | `~/respaldos/lavado_de_carros` |
| `RETENCION_DIAS` | diarios que se conservan | 30 |
| `RETENCION_MESES` | mensuales que se conservan | 12 |
| `DESTINO_EXTERNO` | destino rsync fuera del servidor | vacio |

## ⚠️ La limitacion que queda: todo vive en el mismo servidor

`DESTINO_EXTERNO` esta **vacio**. El respaldo esta en el mismo disco que el
sistema: cubre el borrado accidental, el error de migracion y la corrupcion de
datos, que son los casos frecuentes. **No cubre perder el servidor** (disco,
incendio, robo).

Cerrarlo es definir `DESTINO_EXTERNO` con un destino rsync —otro equipo, un NAS,
un disco externo montado— y el Paso 7 del script lo copia solo. Mientras no
exista ese destino, el script lo avisa en cada corrida.

## Instalacion del cron (si hubiera que rehacerlo)

```bash
crontab -e
```

y agregar:

```
# Respaldo diario de Total Clean Car (base, archivos subidos y secretos)
30 3 * * * /home/server-dt/Documentos/lavado_de_carros/scripts/respaldo.sh >> /home/server-dt/respaldos/lavado_de_carros/log/cron.log 2>&1
```

Como el usuario **`server-dt`**, no como root: no hace falta, y el paquete lleva
el `.env` con secretos en claro.

## Recuperacion

### Base de datos

```bash
# 1. Desempaquetar
cd ~/respaldos/lavado_de_carros
tar xzf lavado_AAAA-MM-DD.tar.gz
cd lavado_AAAA-MM-DD

# 2. Revisar a que codigo corresponde ANTES de restaurar
cat repo/estado.txt

# 3. Restaurar (--clean borra los objetos existentes antes de recrearlos)
docker exec -i lavado_de_carros-postgres-1 \
  pg_restore -U lavado_user -d lavado_db --clean --if-exists < base/lavado_db.dump

docker compose restart backend
```

### Archivos subidos

```bash
docker run --rm \
  -v lavado_de_carros_uploads_data:/destino \
  -v ~/respaldos/lavado_de_carros/uploads:/origen:ro \
  busybox cp -a /origen/. /destino/
```

### Secretos

```bash
cp lavado_AAAA-MM-DD/config/raiz.env /home/server-dt/Documentos/lavado_de_carros/.env
chmod 600 /home/server-dt/Documentos/lavado_de_carros/.env
```

## Validacion del respaldo

Un respaldo no probado no cuenta. El script hace **una verificacion automatica en
cada corrida**: despues del `pg_dump` recorre el indice del archivo con
`pg_restore --list`. Si salio truncado o corrupto, falla ahi y no el dia que haga
falta restaurarlo.

Eso comprueba que el archivo se puede leer. Que los datos esten completos se
comprueba restaurando, y conviene repetirlo cada tanto:

```bash
# Base desechable, sin tocar produccion
docker exec lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
  -c "CREATE DATABASE prueba_restauracion;"

docker exec -i lavado_de_carros-postgres-1 \
  pg_restore -U lavado_user -d prueba_restauracion --no-owner < base/lavado_db.dump

# Comparar contra la real
for t in Cliente Vehiculo Reserva Pago Usuario; do
  a=$(docker exec lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db -tAc "SELECT count(*) FROM \"$t\"")
  b=$(docker exec lavado_de_carros-postgres-1 psql -U lavado_user -d prueba_restauracion -tAc "SELECT count(*) FROM \"$t\"")
  echo "$t: $a vs $b"
done

docker exec lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
  -c "DROP DATABASE prueba_restauracion;"
```

**Ejecutado el 2026-10-08:** las 11 tablas coincidieron exactamente (Cliente 7,
Vehiculo 9, Reserva 22, Pago 5, Usuario 12, TipoServicio 6, PrecioServicio 18,
HistorialReserva 42, AsignacionAgenda 24, Calificacion 3, RefreshToken 1), con
los datos legibles. Cierra los casos T-50 y T-51 de `13_PRUEBAS`, que estaban
marcados como "no ejecutable: no hay respaldos".

## Recuperacion ante desastre

| Paso | Estado |
|---|---|
| 1. Clonar el repositorio | ✅ `github.com/megaman0012/lavado_de_carros` |
| 2. Restaurar `.env` | ✅ esta en el paquete (`config/raiz.env`) |
| 3. `./scripts/desplegar.sh` | ✅ reconstruye y aplica migraciones |
| 4. Restaurar base y archivos subidos | ✅ procedimiento de arriba |
| 5. **Perdida total del servidor** | ⚠️ **el respaldo se perderia con el** — falta `DESTINO_EXTERNO` |

## RPO / RTO

| Medida | Antes (2026-09-15) | Hoy |
|---|---|---|
| RPO | **total**: se perdia todo | **hasta 24 h** (el ultimo respaldo de las 03:30) |
| RTO | el servicio volvia en minutos; los datos, nunca | **~15 min**: clonar, desplegar, restaurar |

Las dos medidas valen **mientras el servidor exista**. Ante su perdida total, el
RPO vuelve a ser total hasta que se configure `DESTINO_EXTERNO`.

---

# Antes del 2026-10-08 (version 1.0, para referencia)

Verificado el 2026-09-15: **no existia cron, ni timer de systemd, ni script de
respaldo** para este proyecto. El procedimiento documentado entonces era manual
y nunca se habia ejecutado de forma regular; el unico respaldo existente era el
que se tomo a mano antes del despliegue del 2026-09-27
(`~/respaldos/lavado_de_carros/2026-09-27_pre-total-clean-car/`).

La conclusion de aquel momento: *ante perdida del servidor, se recupera el codigo
pero no el negocio*. Eso es lo que cierra esta version.
