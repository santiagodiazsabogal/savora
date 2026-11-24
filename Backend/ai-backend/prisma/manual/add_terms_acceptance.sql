-- Aceptación de Términos + Privacidad registrada server-side (requisito UGC de Apple).
-- El registro exige acceptTerms=true y estampa la fecha. Usuarios viejos quedan NULL
-- (aceptaron en el cliente cuando el registro solo lo exigía ahí).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
