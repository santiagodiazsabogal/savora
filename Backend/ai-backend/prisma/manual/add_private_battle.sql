-- Partidas privadas del Duelo de Cocina (Fase 1).
-- Aditivo y sin pérdida de datos: solo agrega columnas a CookBattle.
-- Aplicar con:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual/add_private_battle.sql
-- NO usar `prisma db push --accept-data-loss` (drift de schema, ver CLAUDE.md).

ALTER TABLE "CookBattle" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "CookBattle" ADD COLUMN IF NOT EXISTS "joinCode" TEXT;

-- Código de invitación único (solo se setea en partidas privadas).
CREATE UNIQUE INDEX IF NOT EXISTS "CookBattle_joinCode_key" ON "CookBattle" ("joinCode");
