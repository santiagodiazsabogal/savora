-- Panel de moderación (Apple 1.2): admin + baneo de usuarios.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banReason" TEXT;
CREATE INDEX IF NOT EXISTS "User_bannedAt_idx" ON "User"("bannedAt");

-- Bootstrap del primer admin (cuenta fundadora).
-- Sustituye el placeholder por el email real al ejecutarlo; no se versiona
-- para no exponer una dirección personal en el repo.
UPDATE "User" SET "isAdmin" = true WHERE email = 'TU_EMAIL_ADMIN@ejemplo.com';
