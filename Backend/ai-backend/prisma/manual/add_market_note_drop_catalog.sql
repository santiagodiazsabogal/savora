-- Pivote del mercado (2026-07-13): buscador de comida GENÉRICA (lista estática en el front,
-- con emoji) + nota opcional de marca por ítem + precio estimado por IA. Se elimina toda la
-- etapa Kroger/Open Food Facts/catálogo propio (fotos lentas + productos raros).

-- 1) Nota opcional del usuario por ítem (p.ej. preferencia de marca).
ALTER TABLE "MarketItem" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- 2) El catálogo propio (sembrado desde OFF) ya no se usa → se elimina.
DROP TABLE IF EXISTS "MarketCatalogItem";
