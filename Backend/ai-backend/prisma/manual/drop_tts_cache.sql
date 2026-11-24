-- TTS efímero (2026-07-05): el audio ya NO se persiste (caché en memoria con TTL/LRU
-- en tts.service). El modelo TtsCache se quitó del schema; la tabla queda inerte.
-- ⚠️ PENDIENTE (destructivo, requiere OK explícito):
DROP TABLE IF EXISTS "TtsCache";
