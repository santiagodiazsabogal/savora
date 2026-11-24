-- Tienda Kroger elegida por el usuario (selector "Choose your store" del mercado).
-- El usuario busca por ciudad o ZIP, elige una tienda real y se guarda su locationId:
-- las búsquedas de productos y los precios usan la tienda directamente (más fiable que
-- resolver el ZIP en cada request, y garantiza que la ubicación elegida FUNCIONA).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "krogerStoreId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "krogerStoreName" TEXT;
