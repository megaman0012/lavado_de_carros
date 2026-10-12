-- Migración 2026-10-12 (3): lavado remoto a domicilio (fase 3 de la expansión).
--
-- Se aplica con scripts/desplegar.sh, que la anota en "_migracion_aplicada" y no
-- la repite. A mano (UNA sola vez):
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-10-12_lavado_remoto.sql
--
-- La DDL la generó `prisma migrate diff` contra schema.prisma. Lo agregado a mano:
--   * Reserva.id_ciudad se llena con la ciudad del sitio de cada reserva antes
--     de volverse obligatoria (un lavado a domicilio no tiene sitio: su ciudad
--     sale del sector).
--   * El parámetro del cargo por visita fallida, al 100 %.

BEGIN;

-- AlterTable
ALTER TABLE "Lavador" ADD COLUMN     "id_unidad" INTEGER;

-- AlterTable
-- La ciudad de cada reserva: se agrega nulable, se llena con la de su sitio
-- (desde la fase 1 toda reserva tiene sitio) y recién entonces pasa a NOT NULL
ALTER TABLE "Reserva" ADD COLUMN     "id_ciudad" INTEGER,
ADD COLUMN     "id_visita" INTEGER;
UPDATE "Reserva" r SET "id_ciudad" = e."id_ciudad"
FROM "Estacionamiento" e WHERE e."id" = r."id_estacionamiento";
ALTER TABLE "Reserva" ALTER COLUMN "id_ciudad" SET NOT NULL;

-- CreateTable
CREATE TABLE "Sector" (
    "id" SERIAL NOT NULL,
    "id_ciudad" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "traslado_min" INTEGER NOT NULL DEFAULT 30,
    "recargo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadMovil" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "id_ciudad" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 1,
    "horario_inicio" TEXT NOT NULL DEFAULT '07:00',
    "horario_fin" TEXT NOT NULL DEFAULT '18:00',
    "lleva_agua" BOOLEAN NOT NULL DEFAULT false,
    "lleva_energia" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'activo',

    CONSTRAINT "UnidadMovil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visita" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_unidad" INTEGER NOT NULL,
    "id_sector" INTEGER NOT NULL,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "contacto_nombre" TEXT,
    "contacto_telefono" TEXT,
    "tiene_agua" BOOLEAN NOT NULL DEFAULT false,
    "tiene_luz" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora_salida" TEXT NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "hora_regreso" TEXT NOT NULL,
    "traslado_min" INTEGER NOT NULL,
    "recargo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'programada',
    "motivo_falla" TEXT,
    "llegada_en" TIMESTAMP(3),
    "llegada_latitud" DOUBLE PRECISION,
    "llegada_longitud" DOUBLE PRECISION,
    "llegada_precision" DOUBLE PRECISION,
    "salida_en" TIMESTAMP(3),
    "fin_en" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parametro" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sector_id_ciudad_nombre_key" ON "Sector"("id_ciudad", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Visita_codigo_key" ON "Visita"("codigo");

-- CreateIndex
CREATE INDEX "Visita_fecha_idx" ON "Visita"("fecha");

-- CreateIndex
CREATE INDEX "Visita_id_unidad_idx" ON "Visita"("id_unidad");

-- CreateIndex
CREATE INDEX "Reserva_id_ciudad_idx" ON "Reserva"("id_ciudad");

-- CreateIndex
CREATE INDEX "Reserva_id_visita_idx" ON "Reserva"("id_visita");

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadMovil" ADD CONSTRAINT "UnidadMovil_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visita" ADD CONSTRAINT "Visita_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visita" ADD CONSTRAINT "Visita_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "UnidadMovil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visita" ADD CONSTRAINT "Visita_id_sector_fkey" FOREIGN KEY ("id_sector") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lavador" ADD CONSTRAINT "Lavador_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "UnidadMovil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_id_ciudad_fkey" FOREIGN KEY ("id_ciudad") REFERENCES "Ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_id_visita_fkey" FOREIGN KEY ("id_visita") REFERENCES "Visita"("id") ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO "Parametro" ("clave", "valor", "descripcion", "updatedAt") VALUES
  ('remoto.cargo_visita_fallida_pct', '100',
   'Porcentaje del precio que se cobra cuando el equipo llega y no puede lavar (sin acceso, sin agua o luz, el vehículo no está)',
   CURRENT_TIMESTAMP);

COMMIT;
