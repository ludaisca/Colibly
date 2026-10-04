-- Gemini 2.5 Flash dejó de estar disponible para claves nuevas. El catálogo
-- y los nuevos bots usan 3.8 Flash; los bots/calificadores existentes deben
-- guardar el mismo id para que el uso y su costo se atribuyan correctamente.
UPDATE "wa_bots"
SET "model" = 'gemini-3.8-flash'
WHERE "provider" = 'google'
  AND "model" IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite');

UPDATE "wa_lead_scorer_bots"
SET "model" = 'gemini-3.8-flash'
WHERE "provider" = 'google'
  AND "model" IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite');
