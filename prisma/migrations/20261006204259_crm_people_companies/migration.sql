-- CreateEnum
CREATE TYPE "PersonLifecycle" AS ENUM ('LEAD', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SavedViewEntity" AS ENUM ('PEOPLE', 'COMPANIES');

-- AlterTable
-- Nullable mientras se rellena; se vuelve NOT NULL al final de esta migración.
ALTER TABLE "contacts" ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "phone_digits" TEXT,
    "job_title" TEXT,
    "company_id" TEXT,
    "owner_id" TEXT,
    "lifecycle" "PersonLifecycle" NOT NULL DEFAULT 'LEAD',
    "source" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "owner_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "person_id" TEXT,
    "company_id" TEXT,
    "actor_id" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity" "SavedViewEntity" NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_organization_id_archived_at_updated_at_idx" ON "people"("organization_id", "archived_at", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "people_organization_id_phone_digits_idx" ON "people"("organization_id", "phone_digits");

-- CreateIndex
CREATE INDEX "people_organization_id_email_idx" ON "people"("organization_id", "email");

-- CreateIndex
CREATE INDEX "people_organization_id_owner_id_idx" ON "people"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "people_company_id_idx" ON "people"("company_id");

-- CreateIndex
CREATE INDEX "companies_organization_id_archived_at_name_idx" ON "companies"("organization_id", "archived_at", "name");

-- CreateIndex
CREATE INDEX "companies_organization_id_owner_id_idx" ON "companies"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_person_id_created_at_idx" ON "activity_logs"("organization_id", "person_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_company_id_created_at_idx" ON "activity_logs"("organization_id", "company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "saved_views_organization_id_entity_idx" ON "saved_views"("organization_id", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "import_runs_organization_id_fingerprint_key" ON "import_runs"("organization_id", "fingerprint");

-- CreateIndex
CREATE INDEX "contacts_personId_idx" ON "contacts"("personId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Datos: una Person por cada Contact existente ─────────────────────────
-- Id determinista ('prs_' + id del contacto): idempotente y sin fusionar nada
-- por adivinanza. Los duplicados reales (mismo móvil en dos cuentas, 52/521)
-- se detectan y fusionan desde el CRM (lib/crm/duplicates.ts, lib/crm/merge.ts).
INSERT INTO "people" ("id", "organization_id", "name", "phone", "phone_digits", "lifecycle", "source", "version", "created_at", "updated_at")
SELECT
  'prs_' || c."id",
  COALESCE(a."organization_id", ca."organization_id"),
  COALESCE(NULLIF(c."name", ''), c."remoteJid"),
  CASE WHEN c."accountId" IS NOT NULL AND c."remoteJid" ~ '^[0-9]{7,15}$' THEN c."remoteJid" END,
  CASE WHEN c."accountId" IS NOT NULL AND c."remoteJid" ~ '^[0-9]{7,15}$' THEN c."remoteJid" END,
  (CASE WHEN c."leadStatus" = 'CUSTOMER' THEN 'CUSTOMER' ELSE 'LEAD' END)::"PersonLifecycle",
  CASE WHEN c."accountId" IS NOT NULL THEN 'whatsapp' ELSE lower(ca."channel"::text) END,
  1,
  c."created_at",
  c."updated_at"
FROM "contacts" c
LEFT JOIN "wa_accounts" a ON a."id" = c."accountId"
LEFT JOIN "channel_accounts" ca ON ca."id" = c."channelAccountId"
WHERE c."personId" IS NULL;

UPDATE "contacts" SET "personId" = 'prs_' || "id" WHERE "personId" IS NULL;

ALTER TABLE "contacts" ALTER COLUMN "personId" SET NOT NULL;
