# Docker

## Servicios

| Servicio | Imagen | Puerto | Volumen | Healthcheck | Depende de |
|---|---|---|---|---|---|
| `postgres` | `postgres:15-alpine` | **`5437:5432`** (toda interfaz) | `postgres_data` | ✅ `pg_isready` | — |
| `backend` | build `./backend` | **`3042:3042`** (toda interfaz) | `uploads_data` -> `/app/uploads` | ❌ ninguno | `postgres` (service_healthy) |
| `frontend` | build `./frontend` | **`3041:80`** (toda interfaz) | — | ❌ ninguno | `backend` |

Todos con `restart: unless-stopped`.

**`depends_on: condition: service_healthy`** en el backend es correcto: espera a
que PostgreSQL acepte conexiones antes de arrancar, no solo a que el contenedor
exista.

## Variables de entorno

Se inyectan desde `.env` (no versionado; existe `.env.example`).

| Grupo | Variables | Nota |
|---|---|---|
| Base de datos | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` | `SECRET DETECTADO — NO DOCUMENTAR VALOR` |
| Sesion | `JWT_SECRET`, `JWT_EXPIRES_IN` | `SECRET DETECTADO — NO DOCUMENTAR VALOR` |
| Servidor | `PORT`, `NODE_ENV` | |
| Limites | `RATE_LIMIT_GENERAL`, `RATE_LIMIT_OFF` | |
| Correo | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | `SMTP_PASS`: `SECRET DETECTADO` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | `TWILIO_AUTH_TOKEN`: `SECRET DETECTADO` |

## Operaciones

    cd /home/server-dt/Documentos/lavado_de_carros

    docker compose ps
    docker compose logs -f backend
    docker compose up -d
    docker compose restart backend
    docker compose down                 # conserva volumenes
    docker compose up -d --build        # tras cambiar codigo

**Nunca usar `docker compose down -v`**: borraria la base de datos y los
archivos subidos.

## Backup

    # Base de datos
    docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup.sql.gz

    # Archivos subidos (evidencias y comprobantes)
    docker run --rm -v lavado_de_carros_uploads_data:/d -v "$PWD":/b alpine \
      tar czf /b/uploads.tar.gz -C /d .

Detalle en `12_CONTINUIDAD/Backup_Recuperacion.md`.

## Observaciones

- **Backend y frontend sin healthcheck.** Solo PostgreSQL lo tiene. Un backend
  colgado se reportaria "Up" y no se reiniciaria.
- **Los tres puertos se publican en todas las interfaces**, incluido el de la
  base de datos. Ver SEC-01 y SEC-03.
- El backend expone `GET /api/health`, que devuelve
  `{status:'ok', message, timestamp}`: sirve como base para el healthcheck que
  falta.
