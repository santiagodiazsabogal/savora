-- Imagen del producto en el mercado (foto real de Kroger, misma llamada que el precio).
-- Nullable: ítems manuales/IA quedan sin imagen y el frontend pinta un fallback por categoría.
-- Nombres iguales a los que genera Prisma.

ALTER TABLE "MarketItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
