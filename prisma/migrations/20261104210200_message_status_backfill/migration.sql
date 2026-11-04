-- Corrección de datos (docs/API_WEBHOOKS_AUDITORIA_2026-11-04.md, A3 y punto 10).

-- 1) Mensajes de campaña: WACampaignRecipient guardó la hora de entrega y de
--    lectura desde siempre; WAMessage solo desde el 2026-11-04. Se copian
--    donde el mensaje aún no las tiene.
UPDATE "wa_messages" m
SET "delivered_at" = COALESCE(m."delivered_at", r."deliveredAt"),
    "read_at"      = COALESCE(m."read_at", r."readAt")
FROM "wa_campaign_recipients" r
WHERE r."wamid" IS NOT NULL
  AND r."wamid" = m."wamid"
  AND m."direction" = 'OUTBOUND'
  AND (m."delivered_at" IS NULL AND r."deliveredAt" IS NOT NULL
       OR m."read_at" IS NULL AND r."readAt" IS NOT NULL);

-- 2) Un mensaje leído fue entregado: si Meta saltó directo a "read" (o el
--    "delivered" llegó tarde y se descartó), la entrega es a más tardar la lectura.
UPDATE "wa_messages"
SET "delivered_at" = "read_at"
WHERE "read_at" IS NOT NULL AND "delivered_at" IS NULL;
