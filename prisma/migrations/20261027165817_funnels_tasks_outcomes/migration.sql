-- CreateEnum
CREATE TYPE "PipelineStageOutcome" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "pipeline_stage_id" TEXT;

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
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
    "outcome" "PipelineStageOutcome" NOT NULL DEFAULT 'OPEN',
    "lead_status" "LeadStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "due_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_outcome_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "outcome" "PipelineStageOutcome" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_outcome_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_organization_id_idx" ON "pipelines"("organization_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_position_idx" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "contact_tasks_contact_id_done_idx" ON "contact_tasks"("contact_id", "done");

-- CreateIndex
CREATE INDEX "contact_tasks_organization_id_idx" ON "contact_tasks"("organization_id");

-- CreateIndex
CREATE INDEX "lead_outcome_events_organization_id_created_at_idx" ON "lead_outcome_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "contacts_pipeline_stage_id_idx" ON "contacts"("pipeline_stage_id");

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_pipeline_stage_id_fkey" FOREIGN KEY ("pipeline_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Embudo por defecto para las organizaciones que ya existían, y sus contactos
-- en la columna que ya tenían (lead_status).
INSERT INTO "pipelines" ("id", "organization_id", "name", "position", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", 'Ventas', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "pipelines" p WHERE p."organization_id" = o."id");

INSERT INTO "pipeline_stages" ("id", "pipeline_id", "name", "position", "outcome", "lead_status", "created_at", "updated_at")
SELECT gen_random_uuid()::text, p."id", s.name, s.pos, s.outcome::"PipelineStageOutcome", s.status::"LeadStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "pipelines" p
CROSS JOIN (VALUES
  ('Nuevos', 0, 'OPEN', 'NEW'),
  ('Contactados', 1, 'OPEN', 'CONTACTED'),
  ('Calificados', 2, 'OPEN', 'QUALIFIED'),
  ('Clientes', 3, 'WON', 'CUSTOMER'),
  ('Perdidos', 4, 'LOST', 'LOST')
) AS s(name, pos, outcome, status)
WHERE p."is_default" = true
  AND NOT EXISTS (SELECT 1 FROM "pipeline_stages" st WHERE st."pipeline_id" = p."id");

UPDATE "contacts" c
SET "pipeline_stage_id" = st."id"
FROM "pipeline_stages" st
JOIN "pipelines" p ON p."id" = st."pipeline_id" AND p."is_default" = true
JOIN "wa_accounts" a ON a."organization_id" = p."organization_id"
WHERE c."accountId" = a."id"
  AND c."pipeline_stage_id" IS NULL
  AND st."lead_status" = c."leadStatus";

UPDATE "contacts" c
SET "pipeline_stage_id" = st."id"
FROM "pipeline_stages" st
JOIN "pipelines" p ON p."id" = st."pipeline_id" AND p."is_default" = true
JOIN "channel_accounts" a ON a."organization_id" = p."organization_id"
WHERE c."channelAccountId" = a."id"
  AND c."pipeline_stage_id" IS NULL
  AND st."lead_status" = c."leadStatus";

