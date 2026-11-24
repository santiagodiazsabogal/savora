-- Tip por paso de receta (reemplaza el tip general).
-- Columna JSON nullable: las recetas antiguas quedan con stepTips NULL y siguen
-- mostrando su `tip` general como fallback en el frontend. Las nuevas recetas
-- guardan aquí un array de tips alineado por índice a `steps`.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "stepTips" JSONB;
