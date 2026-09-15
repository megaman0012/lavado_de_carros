# Backup y recuperacion

## Estado actual: 🔴 SIN RESPALDO AUTOMATICO

Verificado: **no existe cron, ni timer de systemd, ni script de respaldo** para
este proyecto. A diferencia del proyecto Traccar de este mismo servidor, que si
tiene un timer diario, aqui no hay ninguno.

## Que hay que respaldar

| Elemento | Donde | Critico | Recuperable de otro lado |
|---|---|---|---|
| Base de datos | volumen `lavado_de_carros_postgres_data` | **SI** | **no** |
| Evidencias y comprobantes | volumen `lavado_de_carros_uploads_data` | **SI** | **no** |
| `.env` (secretos) | archivo local, no versionado | **SI** | **no** |
| Codigo | repositorio git local | no | esta en git |
| Configuracion | `docker-compose.yml`, versionado | no | esta en git |

**Tres elementos irrecuperables**, y uno de ellos —los archivos subidos— suele
olvidarse porque no esta en la base de datos. Las evidencias fotograficas del
lavado y los comprobantes de pago son respaldo documental del servicio
prestado y del cobro: perderlos tiene consecuencias mas alla de lo tecnico.

## Procedimiento de respaldo

```bash
cd /home/server-dt/Documentos/lavado_de_carros
set -a; . ./.env; set +a
FECHA=$(date +%Y%m%d)
mkdir -p backups

# 1. Base de datos
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "backups/db-$FECHA.sql.gz"

# 2. Archivos subidos
docker run --rm \
  -v lavado_de_carros_uploads_data:/datos:ro \
  -v "$PWD/backups":/destino alpine \
  tar czf "/destino/uploads-$FECHA.tar.gz" -C /datos .

# 3. Secretos (guardar aparte, con permisos restringidos)
cp .env "backups/env-$FECHA.bak" && chmod 600 "backups/env-$FECHA.bak"
```

**Frecuencia sugerida:** diaria.
**Retencion sugerida:** 30 diarios + 12 mensuales.

Ambas son propuestas, no procesos existentes.

## Recuperacion

```bash
# Base de datos
gunzip -c backups/db-AAAAMMDD.sql.gz | \
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Archivos
docker run --rm \
  -v lavado_de_carros_uploads_data:/datos \
  -v "$PWD/backups":/origen alpine \
  tar xzf /origen/uploads-AAAAMMDD.tar.gz -C /datos

docker compose restart backend
```

## Validacion del respaldo

Un respaldo no probado no cuenta. Como minimo:

    gunzip -t backups/db-AAAAMMDD.sql.gz && echo "comprimido integro"
    gunzip -c backups/db-AAAAMMDD.sql.gz | grep -c "CREATE TABLE"

Lo correcto es restaurar contra una base desechable y contar filas.
**Al momento de la auditoria no existe ningun respaldo que validar.**

## Recuperacion ante desastre

1. Clonar el repositorio. ✅ posible
2. Restaurar `.env`. ❌ **hoy no seria posible**
3. `docker compose up -d --build`. ✅ posible
4. Restaurar base de datos y archivos. ❌ **hoy no seria posible**

Conclusion: ante perdida del servidor, **se recupera el codigo pero no el
negocio**.

## RPO / RTO

| Medida | Valor real hoy |
|---|---|
| RPO | **total**: se pierde todo |
| RTO | el servicio vuelve en minutos; los datos, nunca |
