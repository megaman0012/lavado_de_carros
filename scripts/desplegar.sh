#!/usr/bin/env bash
#
# Despliegue de Total Clean Car en el servidor.
#
#   ./scripts/desplegar.sh            despliega lo que ya está en el directorio
#   ./scripts/desplegar.sh --pull     trae antes los cambios de origin/main
#   ./scripts/desplegar.sh --solo-migraciones
#
# Hace, en este orden:
#   1. comprueba que exista el .env con lo imprescindible;
#   2. aplica las migraciones SQL que falten (las lleva anotadas, no se repiten);
#   3. reconstruye las imágenes y levanta los contenedores;
#   4. espera a que la API responda y avisa si no lo hace.
#
# Por qué existe: las migraciones de backend/prisma/migraciones/ se aplicaban a
# mano, copiando y pegando un `docker exec ... psql`. Era cuestión de tiempo que
# alguien olvidara una, o la corriera dos veces.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

ROJO='\033[0;31m'; VERDE='\033[0;32m'; AMARILLO='\033[0;33m'; FIN='\033[0m'
info()  { echo -e "${VERDE}▶${FIN} $*"; }
aviso() { echo -e "${AMARILLO}!${FIN} $*"; }
error() { echo -e "${ROJO}✗${FIN} $*" >&2; exit 1; }

PULL=0
SOLO_MIGRACIONES=0
for arg in "$@"; do
  case "$arg" in
    --pull) PULL=1 ;;
    --solo-migraciones) SOLO_MIGRACIONES=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) error "Opción desconocida: $arg" ;;
  esac
done

# ---------------------------------------------------------------- comprobaciones
[[ -f .env ]] || error "Falta el archivo .env (copiar .env.example y completarlo)."

# El .env NO se puede leer con `source`: docker compose lo interpreta con sus
# propias reglas, no con las del shell, y por eso admite valores sin comillas que
# para bash son sintaxis. El caso real de este archivo es
#     SMTP_FROM=Total Clean Car <no-reply@lavadocarros.local>
# donde bash ve el `<` como una redirección y falla. Poner comillas "arreglaría"
# el source, pero entonces docker compose se las pasaría al contenedor como parte
# del valor. Asi que se lee el valor crudo, igual que lo hace compose.
leer_env() {
  local clave="$1" linea valor
  linea="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${clave}=" .env | tail -n 1)" || true
  [[ -n "$linea" ]] || return 0
  valor="${linea#*=}"
  # Si el valor viene entrecomillado, compose quita las comillas: acá también.
  if [[ "$valor" == \"*\" && ${#valor} -ge 2 ]]; then
    valor="${valor:1:${#valor}-2}"
  elif [[ "$valor" == \'*\' && ${#valor} -ge 2 ]]; then
    valor="${valor:1:${#valor}-2}"
  fi
  printf '%s' "$valor"
}

for variable in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL JWT_SECRET; do
  [[ -n "$(leer_env "$variable")" ]] || error "El .env no define $variable."
done

POSTGRES_USER="$(leer_env POSTGRES_USER)"
POSTGRES_DB="$(leer_env POSTGRES_DB)"
PORT="$(leer_env PORT)"
JWT_SECRET="$(leer_env JWT_SECRET)"

if [[ "$JWT_SECRET" == *"CAMBIAR"* || ${#JWT_SECRET} -lt 32 ]]; then
  aviso "JWT_SECRET es corto o parece el de ejemplo. Generar uno con: openssl rand -hex 32"
  aviso "Cambiarlo cierra todas las sesiones abiertas (es lo esperado)."
fi
# No se vuelve a usar: queda solo lo necesario para hablar con psql.
unset JWT_SECRET

docker compose version >/dev/null 2>&1 || error "Hace falta docker compose."

if [[ $PULL -eq 1 ]]; then
  info "Trayendo cambios de origin/main"
  git pull --ff-only origin main
fi

# ------------------------------------------------------------------ migraciones
# Las migraciones son archivos .sql sueltos (el proyecto no usa `prisma migrate`).
# Para no aplicar dos veces la misma, se anota cada una en una tabla propia.
psql_() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"
}

info "Asegurando que la base esté levantada"
docker compose up -d postgres
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break
  sleep 1
done
docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
  || error "PostgreSQL no respondió a tiempo."

psql_ -q -c 'CREATE TABLE IF NOT EXISTS "_migracion_aplicada" (
  archivo TEXT PRIMARY KEY,
  aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);' >/dev/null

# Las migraciones anteriores a esta tabla ya están aplicadas en producción:
# se dan por puestas si su objeto existe, para no intentar correrlas de nuevo.
if psql_ -tAc "SELECT to_regclass('public.\"TipoVehiculo\"')" | grep -q TipoVehiculo; then
  psql_ -q -c "INSERT INTO \"_migracion_aplicada\" (archivo)
               VALUES ('2026-09-27_tipos_vehiculo_y_adicionales.sql')
               ON CONFLICT DO NOTHING;" >/dev/null
fi

pendientes=0
for archivo in backend/prisma/migraciones/*.sql; do
  [[ -e "$archivo" ]] || continue
  nombre="$(basename "$archivo")"
  ya="$(psql_ -tAc "SELECT 1 FROM \"_migracion_aplicada\" WHERE archivo = '$nombre'")"
  if [[ -n "$ya" ]]; then
    continue
  fi
  info "Aplicando migración: $nombre"
  # Cada archivo ya trae su propio BEGIN/COMMIT.
  psql_ < "$archivo"
  psql_ -q -c "INSERT INTO \"_migracion_aplicada\" (archivo) VALUES ('$nombre');" >/dev/null
  pendientes=$((pendientes + 1))
done

if [[ $pendientes -eq 0 ]]; then
  info "No había migraciones pendientes."
else
  info "$pendientes migración(es) aplicada(s)."
fi

if [[ $SOLO_MIGRACIONES -eq 1 ]]; then
  info "Listo (solo migraciones)."
  exit 0
fi

# ------------------------------------------------------------------- despliegue
info "Reconstruyendo las imágenes"
docker compose build backend frontend

info "Levantando los contenedores"
docker compose up -d

PUERTO="${PORT:-3042}"
info "Esperando a que la API responda en http://localhost:$PUERTO/api/health"
for intento in $(seq 1 30); do
  if curl -fsS -m 3 "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then
    info "API arriba."
    echo
    docker compose ps
    info "Despliegue terminado."
    exit 0
  fi
  sleep 2
done

echo
aviso "La API no respondió en 60 segundos. Últimas líneas del backend:"
docker compose logs --tail 40 backend
error "Despliegue incompleto: revisar el log de arriba."
