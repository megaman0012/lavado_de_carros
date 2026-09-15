# Manual de soporte — Sistemas

Version 1.0 · 2026-09-15 · Ruta: `/home/server-dt/Documentos/lavado_de_carros`

## Diagnostico rapido

    docker compose ps
    curl -s http://127.0.0.1:3042/api/health
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3041/
    docker compose logs --tail 60 backend

## Tabla de problemas

| Problema | Causa | Verificacion | Solucion |
|---|---|---|---|
| La web no abre | frontend caido | `docker compose ps` | `docker compose up -d frontend` |
| La web abre pero todo da error | backend caido o sin base | `curl .../api/health` | `docker compose up -d backend` |
| Backend "Up" pero no responde | proceso colgado; **no hay healthcheck** | `curl` sin respuesta | `docker compose restart backend` |
| Backend reinicia en bucle | no conecta a PostgreSQL | `docker compose logs backend \| grep -i prisma` | verificar que `postgres` este healthy y que `DATABASE_URL` sea correcta |
| Todos reciben "Token invalido" tras un reinicio | cambio el `JWT_SECRET` | comparar `.env` con el valor anterior | restaurar el secreto; si no, todos deben volver a iniciar sesion |
| Un usuario recibe "La cuenta esta suspendida" | `estado` distinto de `activo` en `Usuario`, `Cliente` o `Lavador` | consultar las tres tablas | reactivar la que corresponda |
| Error 429 masivo | limites muy bajos, o `RATE_LIMIT_OFF` mal puesto | revisar `.env` | ajustar y reiniciar backend |
| No salen correos | SMTP mal configurado o caido | `docker compose logs backend \| grep -i smtp` | verificar credenciales SMTP |
| No salen WhatsApp/SMS | credenciales Twilio o saldo | `docker compose logs backend \| grep -i twilio` | verificar cuenta Twilio |
| No suben comprobantes | supera 5 MB, o tipo no permitido | ver el error que devuelve la API | imagen o PDF, menos de 5 MB |
| Se llena el disco | `uploads_data` crece sin purga | `docker system df -v \| grep uploads` | definir retencion; no borrar sin respaldo |
| El pago con tarjeta queda pendiente | **la pasarela no esta conectada** | el mensaje lo dice explicitamente | comportamiento esperado; usar comprobante |

## Consultas utiles a la base

```bash
cd /home/server-dt/Documentos/lavado_de_carros
set -a; . ./.env; set +a
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

```sql
-- Estado de una cuenta (las tres capas que revisa el login)
SELECT u.id, u.usuario, u.rol, u.estado AS estado_usuario,
       c.estado AS estado_cliente, l.estado AS estado_lavador
FROM "Usuario" u
LEFT JOIN "Cliente" c ON c.id_usuario = u.id
LEFT JOIN "Lavador" l ON l.id_usuario = u.id
WHERE u.usuario = 'NOMBRE';

-- Reservas por estado
SELECT estado, count(*) FROM "Reserva" GROUP BY estado ORDER BY 2 DESC;

-- Pagos pendientes de validacion
SELECT id, id_reserva, monto, metodo, estado FROM "Pago" WHERE estado <> 'aprobado';

-- Historial de una reserva
SELECT * FROM "HistorialReserva" WHERE id_reserva = 1 ORDER BY id;
```

> **No usar `pg_stat_user_tables.n_live_tup` para contar filas**: son
> estimaciones y en esta base daban valores muy distintos de los reales.
> Usar siempre `count(*)`.

## Conectividad

| Desde | Hacia | Para que |
|---|---|---|
| navegador | :3041 | interfaz |
| navegador | :3042 | API (esta publicada directamente) |
| backend | postgres:5432 | datos |
| backend | SMTP | correos |
| backend | api.twilio.com | WhatsApp y SMS |

## Escalamiento

| Situacion | A quien |
|---|---|
| Perdida de datos sin respaldo | responsable del negocio; **hoy no hay respaldo** |
| Conexion de la pasarela de pagos | **no conectar sin resolver SEC-02** (webhook sin firma) |
| Exposicion de PostgreSQL en la red | Sistemas — SEC-01 |
