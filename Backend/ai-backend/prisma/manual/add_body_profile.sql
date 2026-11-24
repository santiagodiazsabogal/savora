-- Datos corporales OPCIONALES para personalizar la meta nutricional del dashboard
-- (fórmula Mifflin-St Jeor → TDEE → meta semanal). Whitelist en UpdateProfileDto.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "weightKg" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "heightCm" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthYear" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sex" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activityLevel" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mealsPerWeek" INTEGER;
