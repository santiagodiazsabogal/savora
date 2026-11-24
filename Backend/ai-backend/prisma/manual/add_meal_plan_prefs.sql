-- Preferencias nutricionales del planificador semanal.
-- MealPlanEntry.prefs = { calorieGoal, nutritionGoals, servings } — snapshot del sheet
-- "Customize your week" al generar; el "Prepare" las inyecta al generar la Recipe completa.
-- Slots manuales o generados antes de este cambio quedan NULL (prepare sin constraints extra).
ALTER TABLE "MealPlanEntry" ADD COLUMN IF NOT EXISTS "prefs" JSONB;
