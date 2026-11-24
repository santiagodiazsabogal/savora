-- Índices de rendimiento para queries calientes que ordenaban/contaban sin índice (2026-06-27).
-- Idempotente (IF NOT EXISTS). Nombres siguiendo la convención de Prisma para que schema y DB
-- queden consistentes (@@index añadido en schema.prisma; los índices no afectan al cliente generado).

-- Browse de clanes (ORDER BY xpColectivoSemanal, xpColectivoTotal) + rank propio (count xpColectivoSemanal > X)
CREATE INDEX IF NOT EXISTS "Clan_xpColectivoSemanal_xpColectivoTotal_idx"
  ON "Clan" ("xpColectivoSemanal" DESC, "xpColectivoTotal" DESC);

-- Rank global de clan en badges (count xpColectivoTotal > X) — corre en cada apertura de perfil/logros
CREATE INDEX IF NOT EXISTS "Clan_xpColectivoTotal_idx"
  ON "Clan" ("xpColectivoTotal" DESC);

-- Purga diaria de refresh tokens (deleteMany expiresAt < now) sobre la tabla que más rápido crece
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx"
  ON "RefreshToken" ("expiresAt");
