-- Despensa (PantryCheck) + Mercado (grocery list PRO/CHEF).
-- Columnas nuevas en User + tabla MarketItem, sin tocar el resto del schema.
-- Nombres de tabla/columnas/índices iguales a los que genera Prisma.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pantry" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zipCode" TEXT;

CREATE TABLE IF NOT EXISTS "MarketItem" (
  "id"          SERIAL       NOT NULL,
  "userId"      INTEGER      NOT NULL,
  "name"        TEXT         NOT NULL,
  "quantity"    TEXT,
  "priceCents"  INTEGER,
  "priceSource" TEXT,
  "checked"     BOOLEAN      NOT NULL DEFAULT false,
  "recipeTitle" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketItem_userId_createdAt_idx"
  ON "MarketItem" ("userId", "createdAt");

ALTER TABLE "MarketItem"
  ADD CONSTRAINT "MarketItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
