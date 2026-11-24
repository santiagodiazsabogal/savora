-- XP por cocinar: marca la 1ª vez que el usuario termina el Modo Cocina de una receta.
-- Nullable; al setearse una vez se otorga COOK_MODE_XP y no se vuelve a otorgar (idempotente).
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "cookedAt" TIMESTAMP(3);
