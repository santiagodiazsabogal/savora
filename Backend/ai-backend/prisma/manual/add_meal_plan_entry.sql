-- Crea SOLO la tabla del Planificador Semanal (MealPlanEntry), sin tocar el resto
-- del schema. Nombres de tabla/columnas/índices iguales a los que genera Prisma
-- para que el cliente generado funcione contra esta tabla.
CREATE TABLE IF NOT EXISTS "MealPlanEntry" (
  "id"          SERIAL       NOT NULL,
  "userId"      INTEGER      NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL,
  "mealTime"    TEXT         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "difficulty"  TEXT,
  "cookTime"    INTEGER,
  "recipeId"    INTEGER,
  "source"      TEXT         NOT NULL DEFAULT 'manual',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MealPlanEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MealPlanEntry_userId_date_mealTime_key"
  ON "MealPlanEntry" ("userId", "date", "mealTime");

CREATE INDEX IF NOT EXISTS "MealPlanEntry_userId_date_idx"
  ON "MealPlanEntry" ("userId", "date");

ALTER TABLE "MealPlanEntry"
  ADD CONSTRAINT "MealPlanEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MealPlanEntry"
  ADD CONSTRAINT "MealPlanEntry_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
