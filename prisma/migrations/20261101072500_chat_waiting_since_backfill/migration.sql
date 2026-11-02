-- Backfill de waiting_since (migración de datos, separada del cambio de
-- esquema 20261101072404_chat_waiting_since).
--
-- Un chat "espera respuesta" si su último mensaje es entrante y no está
-- resuelto. Solo se marca si ese mensaje es de los últimos 30 días: un chat
-- que nadie contestó hace meses no debe aparecer de golpe como "espera 180
-- días". En WhatsApp se ignoran los mensajes importados del historial de
-- coexistencia (origin = 'HISTORY'), que no son conversaciones vivas.

UPDATE "wa_chats" AS c
SET "waiting_since" = lm."timestamp"
FROM (
  SELECT DISTINCT ON ("chatId") "chatId", "direction", "timestamp"
  FROM "wa_messages"
  WHERE "origin" <> 'HISTORY'
  ORDER BY "chatId", "timestamp" DESC, "created_at" DESC
) AS lm
WHERE lm."chatId" = c."id"
  AND lm."direction" = 'INBOUND'
  AND lm."timestamp" > NOW() - INTERVAL '30 days'
  AND c."status" <> 'RESOLVED'
  AND c."waiting_since" IS NULL;

UPDATE "conversations" AS c
SET "waiting_since" = lm."timestamp"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "direction", "timestamp"
  FROM "channel_messages"
  ORDER BY "conversationId", "timestamp" DESC, "created_at" DESC
) AS lm
WHERE lm."conversationId" = c."id"
  AND lm."direction" = 'INBOUND'
  AND lm."timestamp" > NOW() - INTERVAL '30 days'
  AND c."status" <> 'RESOLVED'
  AND c."waiting_since" IS NULL;
