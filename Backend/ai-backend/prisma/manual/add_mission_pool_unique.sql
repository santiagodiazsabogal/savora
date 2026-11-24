-- Misiones de cursos PERSONALES (módulo missions) ahora son SEMANALES y curadas
-- (antes diarias y generadas por GPT, con metas absurdas). Para que el pool semanal
-- compartido sea idempotente (createMany skipDuplicates) se añade índice único (fecha, titulo).
-- Antes se limpian las misiones viejas (sin 'key' en condicion) y posibles duplicados.

-- 1) Borrar asignaciones de usuario de las misiones viejas (FK → MissionPool).
DELETE FROM "UserMission" um USING "MissionPool" mp
WHERE um."missionId" = mp.id AND (mp.condicion->>'key') IS NULL;

-- 2) Borrar las plantillas viejas (sin key).
DELETE FROM "MissionPool" WHERE (condicion->>'key') IS NULL;

-- 3) Dedupe por (fecha, titulo) y crear el índice único.
DELETE FROM "MissionPool" t USING "MissionPool" d
WHERE t.id > d.id AND t.fecha = d.fecha AND t.titulo = d.titulo;
CREATE UNIQUE INDEX IF NOT EXISTS "MissionPool_fecha_titulo_key" ON "MissionPool" (fecha, titulo);
