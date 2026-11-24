-- Fotos de duelo → Supabase Storage (2026-07-05).
-- La DB guarda solo la URL pública; se elimina la columna base64 (filas pesadas que
-- inflaban cada lectura de la batalla por el pooler). Las fotos en vuelo de batallas
-- activas se pierden (aceptable pre-lanzamiento; el flag photoSubmitted se conserva).
ALTER TABLE "CookBattlePlayer" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;  -- ✅ aplicado 2026-07-05
-- ⚠️ PENDIENTE (destructivo, requiere OK explícito): el código ya no usa photoBase64;
-- la columna queda inerte en la DB hasta ejecutar el DROP.
ALTER TABLE "CookBattlePlayer" DROP COLUMN IF EXISTS "photoBase64";
