-- Objetivo nutricional del usuario (tarjeta de calorías del dashboard).
-- Valores: 'healthy' | 'cut' | 'bulk' | 'balance' (whitelist en UpdateProfileDto).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nutritionGoal" TEXT;
