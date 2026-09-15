# Operacion

## Arquitectura productiva

| Elemento | Valor |
|---|---|
| Servidor | 192.168.3.124 |
| Frontend | `0.0.0.0:3041` |
| API | `0.0.0.0:3042` |
| PostgreSQL | `0.0.0.0:5437` |
| Volumenes | `lavado_de_carros_postgres_data`, `lavado_de_carros_uploads_data` |
| Reinicio | `unless-stopped` en los tres servicios |

## Dependencias externas

| Servicio | Si falla |
|---|---|
| SMTP | no salen correos; el resto del sistema sigue operando |
| Twilio (WhatsApp/SMS) | no salen recordatorios; el resto sigue operando |

Ninguna de las dos deja el sistema inoperativo. **No se verifico si hay
reintentos** ante fallo de estos servicios: `NO DETERMINADO`.

## Healthchecks

Solo PostgreSQL (`pg_isready`). Recomendado para el backend, usando el endpoint
que ya existe:

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3042/api/health || exit 1"]
  interval: 30s
  timeout: 5s
  retries: 3
```

## Monitoreo

No configurado. Verificacion manual:

    curl -s http://127.0.0.1:3042/api/health
    docker compose ps

## Logs

    docker compose logs -f backend
    docker compose logs --since 24h backend

Sin persistencia ni rotacion propia: viven en el journal de Docker.

## Actualizacion

    cd /home/server-dt/Documentos/lavado_de_carros
    git pull
    docker compose up -d --build
    docker compose exec backend npx prisma migrate deploy   # si hay migraciones nuevas

## Rollback

    git log --oneline
    git checkout <commit-anterior>
    docker compose up -d --build

**Cuidado:** si la version nueva aplico migraciones de base de datos, volver
atras el codigo **no revierte el esquema**. Antes de actualizar en produccion,
tomar respaldo de la base (ver `12_CONTINUIDAD`).

## Ventana de indisponibilidad

Reconstruccion completa: pocos minutos. Con 18 reservas y 11 usuarios, la
coordinacion previa es minima, pero conviene evitar horarios de servicio.
