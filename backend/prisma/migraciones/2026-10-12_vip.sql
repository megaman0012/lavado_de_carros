-- Migración 2026-10-12 (4): planes personales VIP con cobro mensual (fase 4).
--
-- Se aplica con scripts/desplegar.sh, que la anota en "_migracion_aplicada" y no
-- la repite. A mano (UNA sola vez):
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-10-12_vip.sql
--
-- La DDL la generó `prisma migrate diff` contra schema.prisma. Los planes y
-- suscripciones que existen quedan como de sitio (tipo 'sitio'), igual que hoy.
-- Lo agregado a mano son los parámetros de la prioridad VIP: los cupos apartados
-- arrancan en 0 (apagado) hasta que el admin decida activarlos.

BEGIN;

-- DropForeignKey
ALTER TABLE "Suscripcion" DROP CONSTRAINT "Suscripcion_id_estacionamiento_fkey";

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "descuento_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dias_anticipacion" INTEGER,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'sitio';

-- AlterTable
ALTER TABLE "Suscripcion" ADD COLUMN     "id_cliente" INTEGER,
ALTER COLUMN "id_estacionamiento" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PagoSuscripcion" (
    "id" SERIAL NOT NULL,
    "id_suscripcion" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'transferencia',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "comprobante_url" TEXT,
    "referencia" TEXT,
    "motivo_rechazo" TEXT,
    "fecha_pago" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoSuscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoSuscripcion_estado_idx" ON "PagoSuscripcion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "PagoSuscripcion_id_suscripcion_periodo_key" ON "PagoSuscripcion"("id_suscripcion", "periodo");

-- CreateIndex
CREATE INDEX "Suscripcion_id_cliente_idx" ON "Suscripcion"("id_cliente");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_id_estacionamiento_fkey" FOREIGN KEY ("id_estacionamiento") REFERENCES "Estacionamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoSuscripcion" ADD CONSTRAINT "PagoSuscripcion_id_suscripcion_fkey" FOREIGN KEY ("id_suscripcion") REFERENCES "Suscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "Parametro" ("clave", "valor", "descripcion", "updatedAt") VALUES
  ('reservas.dias_anticipacion', '14',
   'Hasta cuántos días adelante puede reservar un cliente (los planes VIP pueden dar más)', CURRENT_TIMESTAMP),
  ('vip.cupos_reservados', '0',
   'Cupos de cada franja apartados para clientes VIP (0 = sin apartar). Nunca se aparta el último cupo de un sitio', CURRENT_TIMESTAMP),
  ('vip.horas_liberacion', '24',
   'Horas antes de la franja en que los cupos apartados para VIP se liberan para todos', CURRENT_TIMESTAMP);

COMMIT;
