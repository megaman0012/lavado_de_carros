-- Migración 2026-10-12: operación nacional por ciudades (fase 1 de la expansión).
--
-- Se aplica con scripts/desplegar.sh, que la anota en "_migracion_aplicada" y no
-- la repite. A mano (UNA sola vez):
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-10-12_ciudades.sql
--
-- La DDL la generó `prisma migrate diff` contra schema.prisma; el traspaso de
-- datos se agregó a mano, en el orden que lo permite (columnas nuevas primero
-- nulables, se llenan, y recién entonces NOT NULL):
--   * Estacionamiento.ciudad (texto libre) pasa a la tabla Ciudad. Se normaliza
--     la escritura ("GUAYAQUIL" y "Guayaquil" son la misma); un sitio sin ciudad
--     va a la ciudad del taller.
--   * Los sitios con bahías de lavado pasan a tipo "taller"; el resto, "aliado".
--   * La limpieza profunda no guardaba sitio (el taller era uno solo): sus
--     reservas pasan al taller, que era el único.
--   * Los lavadores eran de todo el país: quedan en la ciudad del taller. Si
--     alguno trabaja en otra, se cambia desde Lavadores.
--   * Usuarios y bloqueos existentes quedan sin ciudad = alcance nacional, que es
--     exactamente como funcionaban hasta hoy.

BEGIN;

CREATE TABLE "Ciudad" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "provincia" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ciudad_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ciudad_nombre_key" ON "Ciudad"("nombre");

-- Ciudades a partir del texto de los sitios, con mayúscula inicial
INSERT INTO "Ciudad" ("nombre")
SELECT DISTINCT initcap(btrim("ciudad"))
FROM "Estacionamiento"
WHERE nullif(btrim("ciudad"), '') IS NOT NULL;

-- Base de datos sin ningún sitio con ciudad: hace falta al menos una para los lavadores
INSERT INTO "Ciudad" ("nombre")
SELECT 'Quito' WHERE NOT EXISTS (SELECT 1 FROM "Ciudad");

-- Provincias de las ciudades conocidas (el resto se completa desde el panel)
UPDATE "Ciudad" SET "provincia" = 'Pichincha' WHERE "nombre" = 'Quito';
UPDATE "Ciudad" SET "provincia" = 'Guayas'    WHERE "nombre" = 'Guayaquil';

-- ---------------------------------------------------------------- sitios
ALTER TABLE "Estacionamiento" ADD COLUMN "id_ciudad" INTEGER,
ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'aliado';

UPDATE "Estacionamiento" e SET "tipo" = 'taller'
WHERE EXISTS (
  SELECT 1 FROM "Plaza" p WHERE p."id_estacionamiento" = e."id" AND p."tipo" = 'bahia_lavado'
);

UPDATE "Estacionamiento" e SET "id_ciudad" = c."id"
FROM "Ciudad" c
WHERE c."nombre" = initcap(btrim(e."ciudad"));

-- "Ciudad de base": la del primer taller; si no hay taller, la del primer sitio;
-- si no hay sitios, la única que existe.
CREATE TEMP TABLE ciudad_base ON COMMIT DROP AS
SELECT coalesce(
  (SELECT "id_ciudad" FROM "Estacionamiento" WHERE "tipo" = 'taller' AND "id_ciudad" IS NOT NULL ORDER BY "id" LIMIT 1),
  (SELECT "id_ciudad" FROM "Estacionamiento" WHERE "id_ciudad" IS NOT NULL ORDER BY "id" LIMIT 1),
  (SELECT "id" FROM "Ciudad" ORDER BY "id" LIMIT 1)
) AS id;

UPDATE "Estacionamiento" SET "id_ciudad" = (SELECT id FROM ciudad_base) WHERE "id_ciudad" IS NULL;

DROP INDEX "Estacionamiento_ciudad_idx";
ALTER TABLE "Estacionamiento" DROP COLUMN "ciudad";
ALTER TABLE "Estacionamiento" ALTER COLUMN "id_ciudad" SET NOT NULL;
CREATE INDEX "Estacionamiento_id_ciudad_idx" ON "Estacionamiento"("id_ciudad");
ALTER TABLE "Estacionamiento" ADD CONSTRAINT "Estacionamiento_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Limpieza profunda sin sitio → el taller (era el único)
UPDATE "Reserva" SET "id_estacionamiento" = (
  SELECT "id" FROM "Estacionamiento" WHERE "tipo" = 'taller' ORDER BY "id" LIMIT 1
)
WHERE "modalidad" = 'profunda' AND "id_estacionamiento" IS NULL;

-- ---------------------------------------------------------------- lavadores
ALTER TABLE "Lavador" ADD COLUMN "id_ciudad" INTEGER;
UPDATE "Lavador" SET "id_ciudad" = (SELECT id FROM ciudad_base);
ALTER TABLE "Lavador" ALTER COLUMN "id_ciudad" SET NOT NULL;
CREATE INDEX "Lavador_id_ciudad_idx" ON "Lavador"("id_ciudad");
ALTER TABLE "Lavador" ADD CONSTRAINT "Lavador_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------- operadores y bloqueos
ALTER TABLE "Usuario" ADD COLUMN "id_ciudad" INTEGER;
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AsignacionAgenda" ADD COLUMN "id_ciudad" INTEGER,
ADD COLUMN "id_estacionamiento" INTEGER;
ALTER TABLE "AsignacionAgenda" ADD CONSTRAINT "AsignacionAgenda_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AsignacionAgenda" ADD CONSTRAINT "AsignacionAgenda_id_estacionamiento_fkey" FOREIGN KEY ("id_estacionamiento") REFERENCES "Estacionamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
