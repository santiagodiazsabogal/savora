-- Retención del feed social (2026-07-05): los posts viven SOCIAL_RETENTION_DAYS (15)
-- y luego un cron los purga (fila + imagen del bucket). Para que las insignias de
-- "likes recibidos" no pierdan progreso al purgar, el total vive en User como contador
-- de por vida (se mantiene en toggleLike; backfill desde los posts actuales).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "likesReceivedTotal" INTEGER NOT NULL DEFAULT 0;

UPDATE "User" u
SET "likesReceivedTotal" = s.total
FROM (
  SELECT "userId", COALESCE(SUM("likeCount"), 0)::int AS total
  FROM "SocialPost"
  GROUP BY "userId"
) s
WHERE u.id = s."userId" AND u."likesReceivedTotal" < s.total;
