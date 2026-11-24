-- Misiones de clan ahora son SEMANALES (fecha = lunes de la semana) y se generan 5
-- distintas por semana. Para que `createMany(skipDuplicates)` evite duplicados aunque
-- dos miembros abran a la vez, se añade un índice único (clanId, fecha, titulo).
-- Antes hay que eliminar los duplicados que dejó la condición de carrera previa.

-- 1) Eliminar duplicados, conservando una fila por (clanId, fecha, titulo).
DELETE FROM "ClanMission" t USING "ClanMission" d
WHERE t.id > d.id
  AND t."clanId" = d."clanId"
  AND t."fecha"  = d."fecha"
  AND t."titulo" = d."titulo";

-- 2) Índice único (nombre que Prisma espera para @@unique([clanId, fecha, titulo])).
CREATE UNIQUE INDEX IF NOT EXISTS "ClanMission_clanId_fecha_titulo_key"
  ON "ClanMission" ("clanId", "fecha", "titulo");
