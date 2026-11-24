-- Duelo de Cocina · Fase 2 (Buffet y Equipos).
-- Aditivo y sin pérdida de datos: agrega columnas por jugador para recetas
-- individuales (cada quien cocina un plato distinto) y equipos.
-- Aplicar con:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual/add_battle_phase2.sql
-- NO usar `prisma db push --accept-data-loss` (drift de schema, ver CLAUDE.md).

ALTER TABLE "CookBattlePlayer" ADD COLUMN IF NOT EXISTS "team" INTEGER;          -- equipos: 0 | 1 (null en otros modos)
ALTER TABLE "CookBattlePlayer" ADD COLUMN IF NOT EXISTS "courseLabel" TEXT;        -- buffet/equipos: curso asignado (main, salad, dessert, ...)
ALTER TABLE "CookBattlePlayer" ADD COLUMN IF NOT EXISTS "recipeData" JSONB;        -- receta individual asignada (buffet/equipos)
ALTER TABLE "CookBattlePlayer" ADD COLUMN IF NOT EXISTS "recipeTitle" TEXT;        -- título de la receta individual
