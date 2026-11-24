-- Insignias de logros (duelos, recetas, clan) + categoría en el catálogo.
-- Aplicado vía Supabase (execute_sql) / `npx prisma db execute`.

-- Categoría de cada insignia para agrupar en el perfil ('curso'|'duelo'|'receta'|'clan'|'general').
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "categoria" TEXT NOT NULL DEFAULT 'general';

-- Contadores de duelos por usuario (insignias de duelo + participación).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "duelsWon" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "duelsPlayed" INTEGER NOT NULL DEFAULT 0;
