-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'CANCELED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "automations" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "channel_accounts" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "lead_sheet_sources" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "meta_ads_accounts" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "wa_bots" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "wa_campaigns" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "wa_lead_scorer_bots" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "wa_sequences" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "webhook_endpoints" ADD COLUMN     "organization_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" TEXT,
    "plan" "PlanId" NOT NULL DEFAULT 'PRO',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'TRIALING',
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_credits_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- ─── Datos: la instalación existente pasa a ser UNA organización ───────────
-- Una instalación de SundayCRM siempre fue una sola empresa, así que todo lo
-- que ya existe queda en una organización "de la casa" (is_internal: sin cobro
-- ni candados de facturación), cuyo dueño es el primer admin registrado. En una
-- base vacía no hace nada.
INSERT INTO "organizations" ("id", "name", "owner_id", "plan", "status", "is_internal", "created_at", "updated_at")
SELECT
  'org_install',
  COALESCE(NULLIF(TRIM((SELECT "businessName" FROM "system_config" WHERE "id" = 'default')), ''), 'Mi empresa'),
  (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1),
  'PRO',
  'ACTIVE',
  true,
  COALESCE((SELECT MIN("created_at") FROM "users"), CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "users");

UPDATE "api_keys" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "automations" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "channel_accounts" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "lead_sheet_sources" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "meta_ads_accounts" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "users" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "wa_accounts" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "wa_bots" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "wa_campaigns" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "wa_lead_scorer_bots" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "wa_sequences" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;
UPDATE "webhook_endpoints" SET "organization_id" = 'org_install' WHERE "organization_id" IS NULL;

ALTER TABLE "api_keys" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "automations" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "channel_accounts" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "lead_sheet_sources" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "meta_ads_accounts" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wa_accounts" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wa_bots" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wa_campaigns" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wa_lead_scorer_bots" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wa_sequences" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "webhook_endpoints" ALTER COLUMN "organization_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_owner_id_key" ON "organizations"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_customer_id_key" ON "organizations"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_subscription_id_key" ON "organizations"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "automations_organization_id_idx" ON "automations"("organization_id");

-- CreateIndex
CREATE INDEX "channel_accounts_organization_id_idx" ON "channel_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "lead_sheet_sources_organization_id_idx" ON "lead_sheet_sources"("organization_id");

-- CreateIndex
CREATE INDEX "meta_ads_accounts_organization_id_idx" ON "meta_ads_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "wa_accounts_organization_id_idx" ON "wa_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "wa_bots_organization_id_idx" ON "wa_bots"("organization_id");

-- CreateIndex
CREATE INDEX "wa_campaigns_organization_id_idx" ON "wa_campaigns"("organization_id");

-- CreateIndex
CREATE INDEX "wa_lead_scorer_bots_organization_id_idx" ON "wa_lead_scorer_bots"("organization_id");

-- CreateIndex
CREATE INDEX "wa_sequences_organization_id_idx" ON "wa_sequences"("organization_id");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organization_id_idx" ON "webhook_endpoints"("organization_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_accounts" ADD CONSTRAINT "wa_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_scorer_bots" ADD CONSTRAINT "wa_lead_scorer_bots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sheet_sources" ADD CONSTRAINT "lead_sheet_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaigns" ADD CONSTRAINT "wa_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bots" ADD CONSTRAINT "wa_bots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads_accounts" ADD CONSTRAINT "meta_ads_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequences" ADD CONSTRAINT "wa_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

