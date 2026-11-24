-- Borrado de cuenta (Apple 5.1.1(v)): soft delete + anonimización irreversible.
-- deletedAt != NULL → cuenta eliminada; los datos PII de User se sobrescriben.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
