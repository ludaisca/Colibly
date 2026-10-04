-- DropForeignKey
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_userId_fkey";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "ai_credits_alert_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "business_hour_end" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "business_hour_start" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "lead_recovery_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lead_recovery_first_message_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "lead_recovery_second_message_hours" INTEGER DEFAULT 12,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- Datos: la configuración operativa pasa de por usuario (app_settings) a la
-- organización. Se toma la del dueño; si no tiene, la del admin más antiguo
-- con configuración. Las API keys por usuario desaparecen: la IA la provee la
-- plataforma (PLATFORM_*_API_KEY).
UPDATE "organizations" o SET
  "timezone" = s."leadRecoveryTimezone",
  "business_hour_start" = s."leadRecoveryBusinessHourStart",
  "business_hour_end" = s."leadRecoveryBusinessHourEnd",
  "lead_recovery_enabled" = s."leadRecoveryEnabled",
  "lead_recovery_first_message_hours" = s."leadRecoveryFirstMessageHours",
  "lead_recovery_second_message_hours" = s."leadRecoverySecondMessageHours"
FROM (
  SELECT DISTINCT ON (u."organization_id") u."organization_id", a.*
  FROM "app_settings" a
  JOIN "users" u ON u."id" = a."userId"
  JOIN "organizations" org ON org."id" = u."organization_id"
  ORDER BY u."organization_id", (u."id" = org."owner_id") DESC, (u."role" = 'admin') DESC, u."created_at" ASC
) s
WHERE o."id" = s."organization_id";

-- Modelos fuera de la lista curada (lib/billing/plans.ts → AI_MODELS) pasan al
-- recomendado de su proveedor.
UPDATE "wa_bots" SET "model" = CASE WHEN "provider" = 'google' THEN 'gemini-2.5-flash' ELSE 'google/gemini-2.5-flash' END
WHERE NOT (("provider" = 'openrouter' AND "model" IN ('google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini'))
        OR ("provider" = 'google' AND "model" IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite')));
UPDATE "wa_lead_scorer_bots" SET "model" = CASE WHEN "provider" = 'google' THEN 'gemini-2.5-flash' ELSE 'google/gemini-2.5-flash' END
WHERE NOT (("provider" = 'openrouter' AND "model" IN ('google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini'))
        OR ("provider" = 'google' AND "model" IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite')));

-- DropTable
DROP TABLE "app_settings";

