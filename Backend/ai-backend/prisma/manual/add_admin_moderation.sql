-- Panel de moderación (Apple 1.2): admin + baneo de usuarios.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banReason" TEXT;
CREATE INDEX IF NOT EXISTS "User_bannedAt_idx" ON "User"("bannedAt");

-- Bootstrap del primer admin (cuenta fundadora). Cambia el email si hace falta.
UPDATE "User" SET "isAdmin" = true WHERE email = 'diego131t@gmail.com';
