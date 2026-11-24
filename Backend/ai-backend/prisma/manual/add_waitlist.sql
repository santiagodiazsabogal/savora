-- Waitlist de pre-lanzamiento (ver modelo WaitlistEntry). La posición NO se guarda:
-- se calcula con ORDER BY "referralCount" DESC, "createdAt" ASC.
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
  "id"            TEXT PRIMARY KEY,
  "email"         TEXT NOT NULL,
  "referralCode"  TEXT NOT NULL,
  "referredBy"    TEXT,
  "referralCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"   TIMESTAMP(3),
  "unsubscribed"  BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_referralCode_key" ON "WaitlistEntry"("referralCode");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_referralCount_createdAt_idx" ON "WaitlistEntry"("referralCount", "createdAt");
