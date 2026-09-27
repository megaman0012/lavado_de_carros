-- Migración 2026-09-27: tipos de vehículo, precios por tipo y servicios adicionales.
--
-- El proyecto no usa `prisma migrate` (el esquema se aplicó con `db push`), así
-- que esta migración se aplica a mano, UNA sola vez y dentro de una transacción:
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-09-27_tipos_vehiculo_y_adicionales.sql
--
-- La DDL la generó `prisma migrate diff` contra schema.prisma; lo que se agregó a
-- mano es el traspaso de datos, para no perder nada de lo que hoy existe:
--   * Vehiculo.tipo (texto) pasa a id_tipo_vehiculo: sedan -> liviano, el resto igual.
--   * El precio y la duración de cada servicio se copian como precio para los tipos
--     liviano, SUV y camioneta (hoy todos pagan lo mismo). Motos quedan SIN precio:
--     no se inventan tarifas; el administrador las carga desde Servicios.

BEGIN;

CREATE TABLE "TipoVehiculo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden_display" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TipoVehiculo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TipoVehiculo_codigo_key" ON "TipoVehiculo"("codigo");

INSERT INTO "TipoVehiculo" ("codigo", "nombre", "descripcion", "orden_display") VALUES
  ('moto',      'Moto',                'Motocicletas y scooters',                  1),
  ('liviano',   'Liviano',             'Sedán, hatchback y autos compactos',       2),
  ('suv',       'SUV',                 'SUV y crossover',                          3),
  ('camioneta', 'Camioneta',           'Pickup, camioneta doble cabina y van',     4);

CREATE TABLE "PrecioServicio" (
    "id" SERIAL NOT NULL,
    "id_tipo_servicio" INTEGER NOT NULL,
    "id_tipo_vehiculo" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PrecioServicio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrecioServicio_id_tipo_servicio_id_tipo_vehiculo_key" ON "PrecioServicio"("id_tipo_servicio", "id_tipo_vehiculo");
ALTER TABLE "PrecioServicio" ADD CONSTRAINT "PrecioServicio_id_tipo_servicio_fkey" FOREIGN KEY ("id_tipo_servicio") REFERENCES "TipoServicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrecioServicio" ADD CONSTRAINT "PrecioServicio_id_tipo_vehiculo_fkey" FOREIGN KEY ("id_tipo_vehiculo") REFERENCES "TipoVehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PrecioServicio" ("id_tipo_servicio", "id_tipo_vehiculo", "precio", "duracion_min")
SELECT s."id", tv."id", s."precio", s."duracion_min"
FROM "TipoServicio" s CROSS JOIN "TipoVehiculo" tv
WHERE tv."codigo" IN ('liviano', 'suv', 'camioneta');

ALTER TABLE "Vehiculo" ADD COLUMN "id_tipo_vehiculo" INTEGER;
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_id_tipo_vehiculo_fkey" FOREIGN KEY ("id_tipo_vehiculo") REFERENCES "TipoVehiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Vehiculo" v SET "id_tipo_vehiculo" = tv."id"
FROM "TipoVehiculo" tv
WHERE tv."codigo" = CASE v."tipo" WHEN 'sedan' THEN 'liviano' ELSE v."tipo" END;

CREATE TABLE "ServicioAdicional" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "duracion_min" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden_display" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServicioAdicional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservaAdicional" (
    "id" SERIAL NOT NULL,
    "id_reserva" INTEGER NOT NULL,
    "id_adicional" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    CONSTRAINT "ReservaAdicional_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservaAdicional_id_reserva_id_adicional_key" ON "ReservaAdicional"("id_reserva", "id_adicional");
ALTER TABLE "ReservaAdicional" ADD CONSTRAINT "ReservaAdicional_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservaAdicional" ADD CONSTRAINT "ReservaAdicional_id_adicional_fkey" FOREIGN KEY ("id_adicional") REFERENCES "ServicioAdicional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recién ahora, con los datos ya traspasados, se eliminan las columnas viejas
ALTER TABLE "Vehiculo" DROP COLUMN "tipo";
ALTER TABLE "TipoServicio" DROP COLUMN "duracion_min", DROP COLUMN "precio";

COMMIT;
