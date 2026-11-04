-- Idempotente. Corre después de `migrate deploy` (scripts/db-migrate.sh).
-- Índices trigram para buscar dentro de los mensajes
-- (GET /api/whatsapp/search/messages). Viven fuera de Prisma igual que el
-- índice pgvector: Prisma no sabe declarar un GIN sobre una expresión, y
-- new-migration.sh compara migraciones contra el schema (no contra la base),
-- así que no los ve como drift.
--
-- La expresión DEBE coincidir carácter por carácter con la de
-- lib/search/messages.ts (SEARCH_EXPR), o el planner no usa el índice.
--
-- Producción: en tablas grandes, crear el índice al arrancar bloquearía las
-- escrituras de la tabla y podría tumbar el healthcheck. Por eso aquí solo se
-- crea si la tabla tiene menos de 200 000 filas estimadas; si no, se avisa y
-- hay que crearlo a mano con CREATE INDEX CONCURRENTLY (runbook en
-- docs/arquitectura/desarrollo.md → "Índices de búsqueda").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE
  est bigint;
BEGIN
  SELECT GREATEST(reltuples, 0)::bigint INTO est FROM pg_class WHERE relname = 'wa_messages';
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_wa_messages_search_trgm') THEN
    IF COALESCE(est, 0) < 200000 THEN
      CREATE INDEX idx_wa_messages_search_trgm ON wa_messages
        USING gin ((coalesce(body, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(transcript, '')) gin_trgm_ops);
    ELSE
      RAISE WARNING 'idx_wa_messages_search_trgm no existe y wa_messages tiene ~% filas: créalo a mano con CREATE INDEX CONCURRENTLY (ver desarrollo.md)', est;
    END IF;
  END IF;

  SELECT GREATEST(reltuples, 0)::bigint INTO est FROM pg_class WHERE relname = 'channel_messages';
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_channel_messages_search_trgm') THEN
    IF COALESCE(est, 0) < 200000 THEN
      CREATE INDEX idx_channel_messages_search_trgm ON channel_messages
        USING gin ((coalesce(body, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(transcript, '')) gin_trgm_ops);
    ELSE
      RAISE WARNING 'idx_channel_messages_search_trgm no existe y channel_messages tiene ~% filas: créalo a mano con CREATE INDEX CONCURRENTLY (ver desarrollo.md)', est;
    END IF;
  END IF;
END $$;

-- Orden de la lista de chats (R6 de docs/RENDIMIENTO_2026-11-04.md). La lista
-- ordena por "lastMessageAt" DESC NULLS LAST y el índice de Prisma
-- (accountId, lastMessageAt) es ASC NULLS LAST: no sirve para ese orden, así
-- que Postgres leía todos los chats de la cuenta y los ordenaba. Prisma no sabe
-- declarar NULLS LAST en un índice, por eso vive aquí. Son tablas de chats
-- (miles de filas, no millones): crearlo al arrancar es seguro.
CREATE INDEX IF NOT EXISTS idx_wa_chats_account_last_message_desc
  ON wa_chats ("accountId", "lastMessageAt" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_account_last_message_desc
  ON conversations ("channelAccountId", "lastMessageAt" DESC NULLS LAST);
