-- IAP / suscripciones (RevenueCat): caducidad del plan de pago actual.
-- El plan en sí vive en User.plan (FREE/PRO/CHEF); esta columna permite el cron de
-- seguridad que baja a FREE si un webhook de expiración se pierde.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);
