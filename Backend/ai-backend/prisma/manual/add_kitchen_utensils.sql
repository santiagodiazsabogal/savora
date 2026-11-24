-- Utensilios de My Kitchen (cajón del inventario): string[] como User.pantry.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "utensils" JSONB;
