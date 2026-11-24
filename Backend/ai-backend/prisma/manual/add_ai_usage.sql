-- Tope diario de generaciones de IA (PRO/CHEF). FREE sigue con requestsUsed (3 de por vida).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiUsageDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiUsageCount" INTEGER NOT NULL DEFAULT 0;
