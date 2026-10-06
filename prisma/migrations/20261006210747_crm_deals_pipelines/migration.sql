-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'MXN';

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "auto_create_deals" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'info',
    "outcome" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "meta_event" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_reasons" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "company_id" TEXT,
    "contact_id" TEXT,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "probability" INTEGER,
    "expected_close_date" TIMESTAMP(3),
    "owner_id" TEXT,
    "created_by_id" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "lost_reason_id" TEXT,
    "loss_note" TEXT,
    "lead_origin" "LeadOrigin" NOT NULL DEFAULT 'ORGANIC',
    "ad_id" TEXT,
    "source" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stage_changes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "from_stage_id" TEXT,
    "from_stage_name" TEXT,
    "to_stage_id" TEXT NOT NULL,
    "to_stage_name" TEXT NOT NULL,
    "to_status" "DealStatus" NOT NULL,
    "actor_id" TEXT,
    "seconds_in_from" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_stage_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_organization_id_archived_at_position_idx" ON "pipelines"("organization_id", "archived_at", "position");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_position_idx" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "loss_reasons_organization_id_archived_at_position_idx" ON "loss_reasons"("organization_id", "archived_at", "position");

-- CreateIndex
CREATE INDEX "deals_organization_id_pipeline_id_stage_id_archived_at_stag_idx" ON "deals"("organization_id", "pipeline_id", "stage_id", "archived_at", "stage_entered_at");

-- CreateIndex
CREATE INDEX "deals_organization_id_owner_id_status_idx" ON "deals"("organization_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "deals_organization_id_status_closed_at_idx" ON "deals"("organization_id", "status", "closed_at");

-- CreateIndex
CREATE INDEX "deals_person_id_idx" ON "deals"("person_id");

-- CreateIndex
CREATE INDEX "deals_contact_id_idx" ON "deals"("contact_id");

-- CreateIndex
CREATE INDEX "deals_organization_id_lead_origin_ad_id_idx" ON "deals"("organization_id", "lead_origin", "ad_id");

-- CreateIndex
CREATE INDEX "deal_stage_changes_deal_id_created_at_idx" ON "deal_stage_changes"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "deal_stage_changes_organization_id_created_at_idx" ON "deal_stage_changes"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "deal_stage_changes_organization_id_to_stage_id_created_at_idx" ON "deal_stage_changes"("organization_id", "to_stage_id", "created_at");

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_reasons" ADD CONSTRAINT "loss_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_reason_id_fkey" FOREIGN KEY ("lost_reason_id") REFERENCES "loss_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Datos: pipeline predeterminado en cada organización ────────────────────
-- Mismo catálogo que lib/crm/pipelines.ts:DEFAULT_STAGES (si cambia uno,
-- cambia el otro). Los ids son deterministas ('pln_<org>', 'stg_<org>_<clave>')
-- para poder mapear los datos viejos sin tablas intermedias.
INSERT INTO "pipelines" ("id", "organization_id", "name", "position", "is_default", "auto_create_deals", "updated_at")
SELECT 'pln_' || o."id", o."id", 'Ventas', 0, true, true, CURRENT_TIMESTAMP FROM "organizations" o;

INSERT INTO "pipeline_stages" ("id", "pipeline_id", "name", "position", "color", "outcome", "probability", "meta_event", "updated_at")
SELECT 'stg_' || o."id" || '_' || d."key", 'pln_' || o."id", d."name", d."position", d."color", d."outcome"::"DealStatus", d."probability", d."meta_event", CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (VALUES
  ('new',       'Nuevo',      0, 'info',    'OPEN', 10,  NULL),
  ('contacted', 'Contactado', 1, 'warning', 'OPEN', 25,  'Contact'),
  ('qualified', 'Calificado', 2, 'accent',  'OPEN', 50,  'Lead'),
  ('won',       'Ganado',     3, 'success', 'WON',  100, 'Purchase'),
  ('lost',      'Perdido',    4, 'muted',   'LOST', 0,   'LeadLost')
) AS d("key", "name", "position", "color", "outcome", "probability", "meta_event");

INSERT INTO "loss_reasons" ("id", "organization_id", "name", "position")
SELECT 'lr_' || o."id" || '_' || d."position", o."id", d."name", d."position"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Precio', 0), ('Sin respuesta', 1), ('Compró con la competencia', 2), ('Ya no le interesa', 3), ('Otro', 4)
) AS d("name", "position");

-- Los contactos que seguían abiertos (Nuevo/Contactado/Calificado) pasan a ser
-- un negocio por persona (el más avanzado). Los Cliente y Perdido no generan
-- negocio: los clientes ya son personas con ciclo de vida "Cliente".
INSERT INTO "deals" ("id", "organization_id", "pipeline_id", "stage_id", "person_id", "contact_id", "title", "owner_id",
                     "stage_entered_at", "lead_origin", "ad_id", "source", "updated_at")
SELECT 'dl_' || c."id", p."organization_id", 'pln_' || p."organization_id",
       'stg_' || p."organization_id" || '_' || CASE c."leadStatus"::text WHEN 'QUALIFIED' THEN 'qualified' WHEN 'CONTACTED' THEN 'contacted' ELSE 'new' END,
       p."id", c."id", p."name", p."owner_id", c."updated_at", c."leadOrigin", c."adId", 'migracion', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (c."personId") c.*
  FROM "contacts" c
  WHERE c."leadStatus"::text IN ('NEW', 'CONTACTED', 'QUALIFIED')
  ORDER BY c."personId",
           CASE c."leadStatus"::text WHEN 'QUALIFIED' THEN 3 WHEN 'CONTACTED' THEN 2 ELSE 1 END DESC,
           c."updated_at" DESC
) c
JOIN "people" p ON p."id" = c."personId";

INSERT INTO "deal_stage_changes" ("id", "organization_id", "deal_id", "to_stage_id", "to_stage_name", "to_status")
SELECT 'dsc_' || d."id", d."organization_id", d."id", d."stage_id", s."name", 'OPEN'
FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id";

-- ─── Secuencias: el disparador "cambia la etapa del lead" pasa a etapas ─────
UPDATE "wa_sequences"
SET "triggerValue" = 'stg_' || "organization_id" || '_' ||
  CASE "triggerValue" WHEN 'CUSTOMER' THEN 'won' WHEN 'LOST' THEN 'lost' WHEN 'QUALIFIED' THEN 'qualified' WHEN 'CONTACTED' THEN 'contacted' ELSE 'new' END
WHERE "triggerType"::text = 'LEAD_STATUS_CHANGED';

BEGIN;
CREATE TYPE "SequenceTriggerType_new" AS ENUM ('TAG_ADDED', 'DEAL_STAGE_CHANGED', 'APPOINTMENT_COMPLETED');
ALTER TABLE "wa_sequences" ALTER COLUMN "triggerType" TYPE "SequenceTriggerType_new"
  USING ((CASE "triggerType"::text WHEN 'LEAD_STATUS_CHANGED' THEN 'DEAL_STAGE_CHANGED' ELSE "triggerType"::text END)::"SequenceTriggerType_new");
ALTER TYPE "SequenceTriggerType" RENAME TO "SequenceTriggerType_old";
ALTER TYPE "SequenceTriggerType_new" RENAME TO "SequenceTriggerType";
DROP TYPE "SequenceTriggerType_old";
COMMIT;

-- ─── Conversions API: el log pasa a colgar de un negocio y una etapa ────────
-- Las filas viejas (una por contacto y estado) no tienen negocio al que
-- ligarse y son solo un registro de lo enviado; el historial en Meta no cambia.
DELETE FROM "meta_conversion_events";
ALTER TABLE "meta_conversion_events" DROP COLUMN "leadStatus",
ADD COLUMN "deal_id" TEXT NOT NULL,
ADD COLUMN "stage_id" TEXT NOT NULL;
DROP INDEX IF EXISTS "meta_conversion_events_contactId_leadStatus_key";
CREATE INDEX "meta_conversion_events_contactId_idx" ON "meta_conversion_events"("contactId");
CREATE UNIQUE INDEX "meta_conversion_events_deal_id_stage_id_key" ON "meta_conversion_events"("deal_id", "stage_id");
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Fuera el viejo estado del lead ─────────────────────────────────────────
DROP INDEX "contacts_accountId_leadStatus_idx";
DROP INDEX "contacts_channelAccountId_leadStatus_idx";
ALTER TABLE "contacts" DROP COLUMN "leadStatus";
DROP TYPE "LeadStatus";
