-- Datos de 20261105004333_user_licenses (docs/PLAN_LICENCIAS_2026-11-04.md,
-- Fase 1: nadie cambia de funciones todavía).

-- Cada persona y cada invitación, con el plan que hoy tiene su organización.
UPDATE "users" u SET "license" = o."plan" FROM "organizations" o WHERE u."organization_id" = o."id";
UPDATE "auth_tokens" t SET "license" = o."plan" FROM "organizations" o WHERE t."organization_id" = o."id" AND t."type" = 'INVITE';

-- Créditos personales: el periodo arranca alineado con el de la organización.
UPDATE "users" u SET "ai_credits_period_start" = o."ai_credits_period_start" FROM "organizations" o WHERE u."organization_id" = o."id";

-- Dueño de cada canal: quien lo conectó, solo para su primer canal de cada
-- tipo. Los que sobran quedan sin dueño (decisión 3 del plan).
UPDATE "wa_accounts" w SET "owner_id" = w."userId"
FROM (SELECT DISTINCT ON ("userId") "id" FROM "wa_accounts" ORDER BY "userId", "created_at", "id") f
WHERE w."id" = f."id";
UPDATE "channel_accounts" c SET "owner_id" = c."userId"
FROM (SELECT DISTINCT ON ("userId", "channel") "id" FROM "channel_accounts" ORDER BY "userId", "channel", "created_at", "id") f
WHERE c."id" = f."id";

-- Monitores: sin autor guardado; se atribuyen al dueño de la organización.
UPDATE "topic_monitors" m SET "created_by_id" = o."owner_id" FROM "organizations" o WHERE m."organization_id" = o."id";

-- Licencias compradas: hoy una sola línea de Stripe (plan × asientos).
UPDATE "organizations" SET "licenses_essential" = "seat_quantity" WHERE "stripe_subscription_id" IS NOT NULL AND "plan" = 'ESSENTIAL';
UPDATE "organizations" SET "licenses_business" = "seat_quantity" WHERE "stripe_subscription_id" IS NOT NULL AND "plan" = 'BUSINESS';
UPDATE "organizations" SET "licenses_pro" = "seat_quantity" WHERE "stripe_subscription_id" IS NOT NULL AND "plan" = 'PRO';
