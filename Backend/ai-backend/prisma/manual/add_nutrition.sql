-- Contador de calorías por receta (estimado por la IA al generar).
-- Recipe.nutrition = { servings, calories, protein, carbs, fat } — valores POR PORCIÓN.
-- Recetas antiguas quedan NULL → el frontend simplemente no muestra la sección.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "nutrition" JSONB;
