-- Migración 2026-10-08: tabla de sesiones para el refresh token.
--
-- El proyecto no usa `prisma migrate` (el esquema se aplicó con `db push`), así
-- que esta migración se aplica a mano, UNA sola vez y dentro de una transacción:
--
--   docker exec -i lavado_de_carros-postgres-1 psql -U lavado_user -d lavado_db \
--     -v ON_ERROR_STOP=1 < backend/prisma/migraciones/2026-10-08_refresh_tokens.sql
--
-- Qué cambia: el token de acceso (JWT) pasa a durar 15 minutos en vez de 24 horas,
-- y el navegador/APK lo renueva solo contra POST /api/auth/refresh con un token
-- opaco de 7 días que vive en esta tabla. Solo se guarda su SHA-256.
--
-- No toca ningún dato existente: únicamente agrega la tabla. Las sesiones que hoy
-- están abiertas con un JWT de 24 horas siguen siendo válidas hasta que venzan;
-- al vencer, esa gente vuelve a iniciar sesión una vez y ya queda con el flujo nuevo.

BEGIN;

CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "familia" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");
CREATE INDEX "RefreshToken_id_usuario_idx" ON "RefreshToken"("id_usuario");
-- La familia se consulta entera cuando hay que cortar una sesión (logout o reuso
-- de un token ya revocado), y el vencimiento, para la purga periódica.
CREATE INDEX "RefreshToken_familia_idx" ON "RefreshToken"("familia");
CREATE INDEX "RefreshToken_expira_idx" ON "RefreshToken"("expira");

-- ON DELETE CASCADE: si algún día se borra un Usuario, sus sesiones se van con él.
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_id_usuario_fkey"
  FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
