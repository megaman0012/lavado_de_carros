#!/usr/bin/env bash
# =============================================================================
# respaldo.sh — Respaldo diario de Total Clean Car
#
# Cierra el ítem #17 del PLAN_TRABAJO.md. Respalda las TRES cosas que no se
# pueden recuperar de ningún otro lado:
#
#   1. la base de datos          (clientes, reservas, pagos, historial)
#   2. los archivos subidos      (evidencia fotográfica y comprobantes de pago)
#   3. el .env                   (JWT_SECRET, contraseña de la base, SMTP, Twilio)
#
# El código NO se respalda: está en GitHub. Lo que sí se guarda es a qué commit
# correspondían los datos, que es lo que hace falta para reconstruir el momento.
#
# -----------------------------------------------------------------------------
# QUIÉN DEBE EJECUTARLO
# -----------------------------------------------------------------------------
# El usuario dueño del proyecto y miembro del grupo `docker` (server-dt). NO root:
# no lo necesita, y el paquete contiene el .env con secretos en claro. Tanto el
# script (700) como la carpeta de respaldos (700) y cada .tar.gz (600) quedan
# restringidos al dueño. No aflojar esos permisos.
#
# -----------------------------------------------------------------------------
# COMPORTAMIENTO ANTE ERRORES
# -----------------------------------------------------------------------------
# Ningún paso aborta el script: si uno falla se registra y se intentan los demás,
# para no perder todo el respaldo por una falla parcial. El resumen final lista
# qué falló y el código de salida lo refleja.
#
#   Códigos de salida:  0 = todo bien   1 = uno o más pasos fallaron
#
# -----------------------------------------------------------------------------
# USO
# -----------------------------------------------------------------------------
#   ./scripts/respaldo.sh                 respaldo completo
#   ./scripts/respaldo.sh --solo-verificar   revisa los respaldos existentes y sale
#
# Variables opcionales:
#   DIR_RESPALDOS     dónde guardar        (def. $HOME/respaldos/lavado_de_carros)
#   RETENCION_DIAS    diarios que se guardan   (def. 30)
#   RETENCION_MESES   mensuales que se guardan (def. 12)
#   DESTINO_EXTERNO   destino rsync fuera del servidor (def. vacío)
#
# Instalación del cron: ver docs/12_CONTINUIDAD/Backup_Recuperacion.md
# =============================================================================

set -uo pipefail   # -e a propósito NO: los pasos se evalúan uno por uno.

# -----------------------------------------------------------------------------
# Configuración
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_RAIZ="$(cd -- "$SCRIPT_DIR/.." && pwd)"

DIR_RESPALDOS="${DIR_RESPALDOS:-$HOME/respaldos/lavado_de_carros}"
DIR_UPLOADS="$DIR_RESPALDOS/uploads"
DIR_LOG="$DIR_RESPALDOS/log"
ARCHIVO_LOG="$DIR_LOG/respaldo.log"

CONTENEDOR_DB="${CONTENEDOR_DB:-lavado_de_carros-postgres-1}"
VOLUMEN_UPLOADS="${VOLUMEN_UPLOADS:-lavado_de_carros_uploads_data}"

# 30 diarios + 12 mensuales es lo que propone docs/12_CONTINUIDAD. El dump pesa
# unos cientos de KB, así que guardar un año de mensuales no cuesta nada.
RETENCION_DIAS="${RETENCION_DIAS:-30}"
RETENCION_MESES="${RETENCION_MESES:-12}"
DESTINO_EXTERNO="${DESTINO_EXTERNO:-}"

FECHA="$(date +%Y-%m-%d)"
HORA="$(date +%H%M)"

declare -a FALLOS=()

mkdir -p "$DIR_LOG" "$DIR_UPLOADS" 2>/dev/null
chmod 700 "$DIR_RESPALDOS" "$DIR_LOG" "$DIR_UPLOADS" 2>/dev/null

LOG_CORRIDA=""

log() {
  local linea
  linea="$(date '+%Y-%m-%d %H:%M:%S')  $*"
  if [[ -n "$LOG_CORRIDA" ]]; then
    printf '%s\n' "$linea" | tee -a "$ARCHIVO_LOG" "$LOG_CORRIDA"
  else
    printf '%s\n' "$linea" | tee -a "$ARCHIVO_LOG"
  fi
}

fallo() {
  local paso="$1" motivo="$2"
  FALLOS+=("$paso: $motivo")
  log "  [ERROR] $paso — $motivo"
}

copiar() {
  local origen="$1" destino="$2" paso="${3:-}"
  if [[ ! -f "$origen" ]]; then
    fallo "$paso" "no se encontró $origen"
    return 1
  fi
  local err
  if err="$(cp -p "$origen" "$destino" 2>&1)"; then
    log "  [OK] ${origen#"$REPO_RAIZ"/}"
    return 0
  fi
  fallo "$paso" "no se pudo copiar $origen ($err)"
  return 1
}

# -----------------------------------------------------------------------------
# Modo --solo-verificar: estado de lo que ya hay, sin generar nada
# -----------------------------------------------------------------------------
verificar() {
  echo "Respaldos en $DIR_RESPALDOS"
  echo
  local n
  n="$(find "$DIR_RESPALDOS" -maxdepth 1 -name 'lavado_*.tar.gz' | wc -l)"
  if [[ "$n" -eq 0 ]]; then
    echo "  ⚠  NO HAY NINGÚN RESPALDO."
    return 1
  fi
  echo "  $n paquete(s), $(du -sh "$DIR_RESPALDOS" 2>/dev/null | cut -f1) en total"
  echo "  espejo de archivos subidos: $(find "$DIR_UPLOADS" -type f 2>/dev/null | wc -l) archivo(s)"
  echo
  echo "  Los 5 más recientes:"
  find "$DIR_RESPALDOS" -maxdepth 1 -name 'lavado_*.tar.gz' -printf '%T@ %p\n' \
    | sort -rn | head -5 | while read -r _ ruta; do
      printf '    %-28s %8s  %s\n' "$(basename "$ruta")" \
        "$(du -h "$ruta" | cut -f1)" "$(date -r "$ruta" '+%Y-%m-%d %H:%M')"
    done
  echo
  local ultimo dias
  ultimo="$(find "$DIR_RESPALDOS" -maxdepth 1 -name 'lavado_*.tar.gz' -printf '%T@\n' | sort -rn | head -1)"
  dias=$(( ( $(date +%s) - ${ultimo%.*} ) / 86400 ))
  if [[ "$dias" -gt 2 ]]; then
    echo "  ⚠  El respaldo más reciente tiene $dias días. ¿Está corriendo el cron?"
    return 1
  fi
  echo "  ✓ El respaldo más reciente tiene $dias día(s)."
  return 0
}

if [[ "${1:-}" == "--solo-verificar" ]]; then
  verificar
  exit $?
fi

# -----------------------------------------------------------------------------
# Preparación
# -----------------------------------------------------------------------------
log "═══════════════════════════════════════════════════════════════"
log "Inicio del respaldo de Total Clean Car (usuario: $(id -un), repo: $REPO_RAIZ)"

# Nunca se sobrescribe un respaldo previo: si ya hay uno de hoy (una corrida
# manual además de la del cron), el nuevo lleva sufijo de hora.
NOMBRE="lavado_${FECHA}"
ARCHIVO_FINAL="$DIR_RESPALDOS/${NOMBRE}.tar.gz"
if [[ -e "$ARCHIVO_FINAL" ]]; then
  NOMBRE="lavado_${FECHA}_${HORA}"
  n=2
  while [[ -e "$DIR_RESPALDOS/${NOMBRE}.tar.gz" ]]; do
    NOMBRE="lavado_${FECHA}_${HORA}-${n}"
    n=$(( n + 1 ))
  done
  ARCHIVO_FINAL="$DIR_RESPALDOS/${NOMBRE}.tar.gz"
  log "Ya existía un respaldo de hoy; este se guardará como ${NOMBRE}.tar.gz"
fi

STAGE="$(mktemp -d)" || { log "[FATAL] No se pudo crear el directorio temporal."; exit 1; }
chmod 700 "$STAGE"
PAQUETE="$STAGE/$NOMBRE"
mkdir -p "$PAQUETE/base" "$PAQUETE/config" "$PAQUETE/repo"
trap 'rm -rf "$STAGE"' EXIT

LOG_CORRIDA="$STAGE/${NOMBRE}.log"
: > "$LOG_CORRIDA"

# Credenciales: se leen del .env, NUNCA con `source`. Dos motivos:
#   1) Seguridad: `source` EJECUTA el archivo; un valor con $(...) correría como
#      comando con los permisos de este script.
#   2) Robustez: el .env de este proyecto tiene
#          SMTP_FROM=Total Clean Car <no-reply@lavadocarros.local>
#      donde `<` es una redirección para bash y revienta el source. Es el mismo
#      error que rompió scripts/desplegar.sh el 2026-10-08.
# Este lector solo extrae texto, nunca lo interpreta.
leer_env() {
  local clave="$1" archivo="$2"
  [[ -f "$archivo" ]] || return 1
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?${clave}[[:space:]]*=[[:space:]]*(.*)$/\2/p" "$archivo" \
    | tail -n1 \
    | sed -E "s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

ENV_RAIZ="$REPO_RAIZ/.env"
[[ -f "$ENV_RAIZ" ]] || log "[AVISO] No se encontró $ENV_RAIZ; se usarán los valores por defecto."
DB_NAME="$(leer_env POSTGRES_DB "$ENV_RAIZ")"; DB_NAME="${DB_NAME:-lavado_db}"
DB_USER="$(leer_env POSTGRES_USER "$ENV_RAIZ")"; DB_USER="${DB_USER:-lavado_user}"

# -----------------------------------------------------------------------------
# Paso 1: dump de la base de datos
# -----------------------------------------------------------------------------
# Formato custom (-Fc): comprimido, y permite restaurar tablas sueltas con
# pg_restore. pg_dump corre DENTRO del contenedor porque el host no tiene cliente
# de PostgreSQL y la red de Docker resuelve el nombre del servicio.
#
# NO se cortan las conexiones activas antes del dump, a diferencia del respaldo
# de TPSD. pg_dump abre una transacción con una instantánea consistente, así que
# no hace falta; y cortarlas de madrugada podría interrumpir a un cliente
# reservando desde el celular.
log "Paso 1: dump de la base '$DB_NAME'..."
if ! docker inspect -f '{{.State.Running}}' "$CONTENEDOR_DB" 2>/dev/null | grep -q true; then
  fallo "Paso 1 (base de datos)" "el contenedor '$CONTENEDOR_DB' no está corriendo o Docker no está disponible"
else
  if docker exec "$CONTENEDOR_DB" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
       > "$PAQUETE/base/${DB_NAME}.dump" 2>"$STAGE/pg.err"; then
    peso="$(du -h "$PAQUETE/base/${DB_NAME}.dump" | cut -f1)"
    log "  [OK] dump generado ($peso)"

    # Un dump que no se puede leer no es un respaldo. pg_restore --list recorre
    # el índice del archivo: si salió truncado o corrupto, falla acá y no el día
    # que haga falta restaurarlo.
    if docker exec -i "$CONTENEDOR_DB" pg_restore --list > "$STAGE/lista.txt" 2>"$STAGE/verif.err" \
         < "$PAQUETE/base/${DB_NAME}.dump"; then
      log "  [OK] dump verificado: $(grep -c 'TABLE DATA' "$STAGE/lista.txt") tablas con datos"
    else
      fallo "Paso 1 (base de datos)" "el dump no se puede leer: $(tail -n1 "$STAGE/verif.err")"
    fi
  else
    fallo "Paso 1 (base de datos)" "pg_dump falló: $(tail -n2 "$STAGE/pg.err" | tr '\n' ' ')"
  fi
fi

# -----------------------------------------------------------------------------
# Paso 2: secretos y configuración
# -----------------------------------------------------------------------------
# El .env es el único de estos que no está en git. Los demás se guardan igual
# para que el paquete sea autosuficiente: restaurar no debería exigir tener
# además el repositorio a mano.
log "Paso 2: secretos y configuración..."
copiar "$ENV_RAIZ"                      "$PAQUETE/config/raiz.env"            "Paso 2 (configuración)"
copiar "$REPO_RAIZ/docker-compose.yml"  "$PAQUETE/config/docker-compose.yml"  "Paso 2 (configuración)"
copiar "$REPO_RAIZ/frontend/nginx.conf" "$PAQUETE/config/nginx.conf"          "Paso 2 (configuración)"

# -----------------------------------------------------------------------------
# Paso 3: a qué código corresponden estos datos
# -----------------------------------------------------------------------------
# El código está en GitHub; lo que no se puede reconstruir después es QUÉ commit
# estaba corriendo cuando se tomó el respaldo. Sin eso, restaurar la base en una
# versión distinta del esquema es adivinar.
log "Paso 3: estado del repositorio..."
{
  echo "Respaldo:   $NOMBRE"
  echo "Fecha:      $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Commit:     $(git -C "$REPO_RAIZ" rev-parse HEAD 2>/dev/null || echo 'desconocido')"
  echo "Rama:       $(git -C "$REPO_RAIZ" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'desconocida')"
  echo "Remoto:     $(git -C "$REPO_RAIZ" remote get-url origin 2>/dev/null || echo 'sin remoto')"
  echo
  echo "Cambios sin commitear al momento del respaldo:"
  git -C "$REPO_RAIZ" status --short 2>/dev/null | sed 's/^/  /' || echo "  (no se pudo consultar)"
  echo
  echo "Migraciones aplicadas en la base:"
  # -tA separa las columnas con "|". Nada de concatenar con || y comillas dobles:
  # en PostgreSQL "  " es un identificador entrecomillado, no un texto, y la
  # consulta fallaba en silencio dejando el campo vacío.
  docker exec "$CONTENEDOR_DB" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    'SELECT archivo, aplicada_en FROM "_migracion_aplicada" ORDER BY aplicada_en;' 2>/dev/null \
    | sed 's/^/  /' | grep . || echo "  (la tabla _migracion_aplicada no existe todavía)"
} > "$PAQUETE/repo/estado.txt" 2>&1
log "  [OK] commit $(git -C "$REPO_RAIZ" rev-parse --short HEAD 2>/dev/null || echo '?')"

# -----------------------------------------------------------------------------
# Paso 4: empaquetar
# -----------------------------------------------------------------------------
log "Paso 4: empaquetando..."
cp -p "$LOG_CORRIDA" "$PAQUETE/" 2>/dev/null
if tar -czf "$ARCHIVO_FINAL" -C "$STAGE" "$NOMBRE" 2>"$STAGE/tar.err"; then
  chmod 600 "$ARCHIVO_FINAL"
  log "  [OK] $ARCHIVO_FINAL ($(du -h "$ARCHIVO_FINAL" | cut -f1))"
else
  fallo "Paso 4 (empaquetar)" "tar falló: $(tail -n2 "$STAGE/tar.err" | tr '\n' ' ')"
fi

# -----------------------------------------------------------------------------
# Paso 5: archivos subidos, por espejo incremental
# -----------------------------------------------------------------------------
# Las fotos de evidencia y los comprobantes NO van dentro del .tar.gz: hoy pesan
# menos de 1 MB, pero cada lavado suma hasta 6 fotos y en un año serían gigas.
# Meterlos en cada paquete multiplicaría eso por los 30 días de retención.
#
# Se copian a un espejo que solo crece. SIN borrar lo que ya no esté en el
# origen: si alguien elimina evidencia del servidor, por error o no, el espejo la
# conserva. Esa es la diferencia entre un respaldo y un espejo.
#
# El `cp -a -u` corre dentro de un contenedor porque el volumen de Docker no es
# legible desde el host sin root. `--user` evita que los archivos del espejo
# queden como root dentro del home del usuario.
log "Paso 5: archivos subidos (incremental)..."
if ! docker volume inspect "$VOLUMEN_UPLOADS" >/dev/null 2>&1; then
  fallo "Paso 5 (archivos subidos)" "no existe el volumen '$VOLUMEN_UPLOADS'"
else
  if docker run --rm --user "$(id -u):$(id -g)" \
       -v "$VOLUMEN_UPLOADS":/origen:ro \
       -v "$DIR_UPLOADS":/destino \
       busybox sh -c 'cp -a -u /origen/. /destino/ 2>&1' >"$STAGE/cp.out" 2>&1; then
    log "  [OK] $(find "$DIR_UPLOADS" -type f | wc -l) archivo(s) en el espejo ($(du -sh "$DIR_UPLOADS" 2>/dev/null | cut -f1))"
  else
    fallo "Paso 5 (archivos subidos)" "la copia falló: $(tail -n2 "$STAGE/cp.out" | tr '\n' ' ')"
  fi
fi

# -----------------------------------------------------------------------------
# Paso 6: retención
# -----------------------------------------------------------------------------
# 30 diarios + 12 mensuales: los paquetes del día 1 de cada mes se conservan un
# año, el resto 30 días. Así un error detectado tarde —un borrado de hace tres
# meses— todavía tiene de dónde recuperarse.
log "Paso 6: retención (${RETENCION_DIAS} diarios, ${RETENCION_MESES} mensuales)..."
borrados=0
while IFS= read -r ruta; do
  base="$(basename "$ruta")"
  dia="${base:14:2}"          # lavado_AAAA-MM-DD.tar.gz → DD
  if [[ "$dia" == "01" ]]; then
    # Mensual: se borra solo pasados los meses de retención.
    if [[ -n "$(find "$ruta" -mtime "+$(( RETENCION_MESES * 31 ))" 2>/dev/null)" ]]; then
      rm -f "$ruta" && borrados=$(( borrados + 1 ))
    fi
  else
    rm -f "$ruta" && borrados=$(( borrados + 1 ))
  fi
done < <(find "$DIR_RESPALDOS" -maxdepth 1 -name 'lavado_*.tar.gz' -mtime "+${RETENCION_DIAS}" 2>/dev/null)
log "  [OK] ${borrados} paquete(s) borrado(s)"

# -----------------------------------------------------------------------------
# Paso 7: copia fuera del servidor
# -----------------------------------------------------------------------------
if [[ -n "$DESTINO_EXTERNO" ]]; then
  log "Paso 7: copiando a $DESTINO_EXTERNO..."
  if rsync -a "$ARCHIVO_FINAL" "$DESTINO_EXTERNO" 2>"$STAGE/ext.err"; then
    log "  [OK] copia externa hecha"
  else
    fallo "Paso 7 (copia externa)" "rsync falló: $(tail -n2 "$STAGE/ext.err" | tr '\n' ' ')"
  fi
else
  log "Paso 7: OMITIDO — DESTINO_EXTERNO está vacío."
  log "  [AVISO] El respaldo vive en el MISMO servidor que el sistema. Si se"
  log "          pierde el servidor (disco, incendio, robo) se pierde también el"
  log "          respaldo. Definir DESTINO_EXTERNO cuando haya a dónde copiar."
fi

# -----------------------------------------------------------------------------
# Resumen
# -----------------------------------------------------------------------------
log "───────────────────────────────────────────────────────────────"
if [[ ${#FALLOS[@]} -eq 0 ]]; then
  log "RESPALDO COMPLETO SIN ERRORES → $(basename "$ARCHIVO_FINAL")"
  log "═══════════════════════════════════════════════════════════════"
  exit 0
fi
log "RESPALDO TERMINADO CON ${#FALLOS[@]} FALLO(S):"
for f in "${FALLOS[@]}"; do log "  · $f"; done
log "═══════════════════════════════════════════════════════════════"
exit 1
