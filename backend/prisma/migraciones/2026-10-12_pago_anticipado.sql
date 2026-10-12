-- Migración 2026-10-12 (5): pago antes del servicio.
--
-- Solo agrega el parámetro (el código ya lo trata como encendido si falta), para
-- que se vea y se pueda cambiar desde el panel. Se aplica con scripts/desplegar.sh.

BEGIN;

INSERT INTO "Parametro" ("clave", "valor", "descripcion", "updatedAt") VALUES
  ('reservas.pago_anticipado', '1',
   'El lavado de contado se paga antes de hacerlo: con saldo no se inicia ni sale el equipo a domicilio (1 = sí, 0 = no). Las empresas, a crédito, no',
   CURRENT_TIMESTAMP)
ON CONFLICT ("clave") DO NOTHING;

COMMIT;
