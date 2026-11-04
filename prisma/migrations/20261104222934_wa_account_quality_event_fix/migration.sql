-- qualityRating guardaba el `event` del webhook phone_number_quality_update
-- (FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…), no la calificación. Se mueve a
-- quality_event; la calificación real (GREEN/YELLOW/RED) la vuelve a leer
-- lib/whatsapp/phone-health.ts de la API.
UPDATE "wa_accounts"
SET "quality_event" = "qualityRating",
    "qualityRating" = NULL
WHERE "qualityRating" IS NOT NULL
  AND upper("qualityRating") NOT IN ('GREEN', 'YELLOW', 'RED', 'UNKNOWN', 'NA');
