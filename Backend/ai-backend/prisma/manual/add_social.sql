-- Red Social Savora (MVP): publicaciones (foto o receta) + likes.
-- Aditivo y sin pérdida de datos: solo crea tablas nuevas, no toca el resto.
-- Nombres de tabla/columnas/índices iguales a los que genera Prisma para que el
-- cliente generado funcione contra estas tablas.
-- Aplicar con:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual/add_social.sql
-- NO usar `prisma db push --accept-data-loss` (drift de schema, ver CLAUDE.md).

-- Publicación del feed: una foto libre (PHOTO) o una receta propia compartida (RECIPE).
CREATE TABLE IF NOT EXISTS "SocialPost" (
  "id"        TEXT         NOT NULL,
  "userId"    INTEGER      NOT NULL,
  "type"      TEXT         NOT NULL,            -- 'PHOTO' | 'RECIPE'
  "imageUrl"  TEXT         NOT NULL,            -- URL pública en Supabase Storage
  "caption"   TEXT,
  "recipeId"  INTEGER,                          -- solo type='RECIPE': receta enlazada
  "likeCount" INTEGER      NOT NULL DEFAULT 0,  -- contador denormalizado (top barato)
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialPost_createdAt_idx"
  ON "SocialPost" ("createdAt");

CREATE INDEX IF NOT EXISTS "SocialPost_type_likeCount_idx"
  ON "SocialPost" ("type", "likeCount");

CREATE INDEX IF NOT EXISTS "SocialPost_userId_idx"
  ON "SocialPost" ("userId");

-- Like (corazón): un usuario solo puede likear un post una vez.
CREATE TABLE IF NOT EXISTS "SocialLike" (
  "id"        TEXT         NOT NULL,
  "postId"    TEXT         NOT NULL,
  "userId"    INTEGER      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialLike_postId_userId_key"
  ON "SocialLike" ("postId", "userId");

CREATE INDEX IF NOT EXISTS "SocialLike_userId_idx"
  ON "SocialLike" ("userId");

-- Foreign keys
ALTER TABLE "SocialPost"
  ADD CONSTRAINT "SocialPost_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
  ADD CONSTRAINT "SocialPost_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialLike"
  ADD CONSTRAINT "SocialLike_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialLike"
  ADD CONSTRAINT "SocialLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
