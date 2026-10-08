# Integracion y despliegue continuos

Version 1.0 · 2026-10-08 — cierra el item #16 del plan de trabajo.

## Resumen

| Pieza | Donde | Cuando corre |
|---|---|---|
| **CI** — pruebas, tipos, build e imagenes | `.github/workflows/ci.yml` | cada push a `main`, cada pull request, y a mano desde Actions |
| **CD** — despliegue en el servidor | `scripts/desplegar.sh` | lo ejecuta una persona en el servidor |

El despliegue **no** esta automatizado desde GitHub, y es a proposito: el
servidor es propio, esta en la red de la empresa y no tiene un runner con
acceso. Automatizarlo desde GitHub exigiria abrirle SSH a internet o instalar un
runner autoalojado. Lo que si se automatizo es la parte que se olvidaba: aplicar
las migraciones. Ver "Como automatizarlo del todo" al final.

---

## Integracion continua

Tres trabajos en paralelo. Si uno falla, los otros igual terminan: en la misma
corrida se ve todo lo que esta roto, no solo lo primero.

### `backend` — las pruebas

Levanta un **PostgreSQL 15 de verdad** como servicio del job. No se usan dobles
porque la logica que mas importa —que una franja no se venda dos veces— vive en
una transaccion serializable, y eso solo lo puede verificar un motor real.

```
postgres:15-alpine   base lavado_test
npm ci
npx prisma generate
npx prisma db push      crea el esquema en la base de pruebas
npm test                184 casos, ~30 s
```

La base se llama `lavado_test` a proposito: `tests/ayudas/bd.js` se niega a
vaciar una base cuyo nombre no contenga "test". Es el seguro contra correr las
pruebas sobre produccion por una variable mal puesta.

### `frontend` — tipos y build

```
npx tsc --noEmit        el compilador, sin generar nada
CI=true npm run build   un warning de ESLint falla la corrida
```

`CI=true` es deliberado: los warnings se arreglan, no se acumulan.

### `imagenes` — los Dockerfile

Construye las dos imagenes por separado con `docker build`, no con
`docker compose build`. Asi no hace falta el `.env`, que no esta versionado:
aqui solo interesa que los Dockerfile sigan siendo validos, que es como se
despliega.

### Que NO verifica

- Comportamiento del frontend (no hay pruebas de componentes).
- Vulnerabilidades de dependencias (`npm audit` no esta en el pipeline).
- Que el despliegue funcione: eso lo dice el health check del script.

---

## Despliegue

```bash
cd /ruta/al/proyecto
./scripts/desplegar.sh --pull
```

Pasos que da:

1. **Comprueba el `.env`** — que exista y defina `POSTGRES_*`, `DATABASE_URL` y
   `JWT_SECRET`. Avisa si el `JWT_SECRET` es corto o parece el de ejemplo.
2. **Trae los cambios** (`--pull`, con `--ff-only`: si hay divergencia, para).
3. **Aplica las migraciones pendientes.** Los archivos de
   `backend/prisma/migraciones/*.sql` se aplicaban copiando y pegando un
   `docker exec ... psql`; era cuestion de tiempo que alguien olvidara una o la
   corriera dos veces. Ahora cada una queda anotada en la tabla
   `_migracion_aplicada` y no se repite. Las anteriores a esa tabla se dan por
   puestas si su objeto ya existe en la base.
4. **Reconstruye y levanta** (`docker compose build` + `up -d`).
5. **Espera a `/api/health`** hasta 60 segundos. Si no responde, muestra las
   ultimas 40 lineas del log del backend y termina con error.

Opciones:

| Opcion | Para que |
|---|---|
| `--pull` | traer `origin/main` antes de desplegar |
| `--solo-migraciones` | aplicar las migraciones sin tocar los contenedores |
| `--help` | ver esta ayuda en la terminal |

### Si algo sale mal

El script no deshace nada solo: una migracion aplicada no se revierte y volver
atras a ciegas puede hacer mas dano. Lo que corresponde:

```bash
docker compose logs --tail 100 backend   # que dice el error
git log --oneline -5                     # a que commit volver
git checkout <commit-anterior> && ./scripts/desplegar.sh
```

Si el problema es de datos y no de codigo, el camino es el respaldo
(`docs/12_CONTINUIDAD/Backup_Recuperacion.md`). **Los respaldos automaticos
siguen siendo el item #17 del plan, todavia abierto**: hasta que existan, un
error de datos en produccion no tiene vuelta atras.

---

## Como automatizarlo del todo

El dia que se quiera desplegar solo al hacer merge en `main`, hay dos caminos:

| Camino | Que hace falta | Comentario |
|---|---|---|
| **Runner autoalojado** | instalar el agente de GitHub Actions en el servidor | el servidor sale hacia GitHub, no al reves: no hay que abrir ningun puerto. Es el camino recomendado. |
| **Despliegue por SSH** | exponer SSH y guardar la clave en los secretos del repositorio | mas simple de configurar, pero abre el servidor a internet. |

En los dos casos el job nuevo se limita a correr `./scripts/desplegar.sh --pull`
en el servidor, con `needs: [backend, frontend, imagenes]` para que solo
despliegue lo que ya paso las pruebas.

**Antes de automatizarlo conviene cerrar el item #17 (respaldos automaticos):**
desplegar solo, sin poder volver atras, cambia un trabajo manual por un riesgo.
