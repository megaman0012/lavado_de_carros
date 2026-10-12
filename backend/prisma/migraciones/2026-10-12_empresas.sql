-- Migración 2026-10-12 (2): clientes empresa, tarifas y cortes mensuales (fase 2).
--
-- Se aplica con scripts/desplegar.sh, que la anota en "_migracion_aplicada" y no
-- la repite. A mano (UNA sola vez):
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-10-12_empresas.sql
--
-- La DDL la generó `prisma migrate diff` contra schema.prisma. Es solo aditiva:
-- todos los clientes existentes quedan como "persona" y todas las reservas como
-- "contado", que es exactamente como funcionaban.

BEGIN;

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "direccion_fiscal" TEXT,
ADD COLUMN     "email_facturacion" TEXT,
ADD COLUMN     "razon_social" TEXT,
ADD COLUMN     "ruc" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'persona';

-- AlterTable
ALTER TABLE "Estacionamiento" ADD COLUMN     "id_cliente" INTEGER;

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "forma_cobro" TEXT NOT NULL DEFAULT 'contado',
ADD COLUMN     "id_corte" INTEGER;

-- CreateTable
CREATE TABLE "TarifaEmpresa" (
    "id" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_tipo_servicio" INTEGER NOT NULL,
    "id_tipo_vehiculo" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarifaEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorteEmpresa" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'cerrado',
    "numero_factura" TEXT,
    "fecha_factura" TIMESTAMP(3),
    "fecha_pago" TIMESTAMP(3),
    "referencia_pago" TEXT,
    "notas" TEXT,
    "usuario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorteEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TarifaEmpresa_id_cliente_id_tipo_servicio_id_tipo_vehiculo_key" ON "TarifaEmpresa"("id_cliente", "id_tipo_servicio", "id_tipo_vehiculo");

-- CreateIndex
CREATE UNIQUE INDEX "CorteEmpresa_codigo_key" ON "CorteEmpresa"("codigo");

-- CreateIndex
CREATE INDEX "CorteEmpresa_id_cliente_idx" ON "CorteEmpresa"("id_cliente");

-- CreateIndex
CREATE INDEX "CorteEmpresa_periodo_idx" ON "CorteEmpresa"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_ruc_key" ON "Cliente"("ruc");

-- CreateIndex
CREATE INDEX "Reserva_id_corte_idx" ON "Reserva"("id_corte");

-- AddForeignKey
ALTER TABLE "TarifaEmpresa" ADD CONSTRAINT "TarifaEmpresa_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEmpresa" ADD CONSTRAINT "TarifaEmpresa_id_tipo_servicio_fkey" FOREIGN KEY ("id_tipo_servicio") REFERENCES "TipoServicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEmpresa" ADD CONSTRAINT "TarifaEmpresa_id_tipo_vehiculo_fkey" FOREIGN KEY ("id_tipo_vehiculo") REFERENCES "TipoVehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorteEmpresa" ADD CONSTRAINT "CorteEmpresa_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estacionamiento" ADD CONSTRAINT "Estacionamiento_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_id_corte_fkey" FOREIGN KEY ("id_corte") REFERENCES "CorteEmpresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
