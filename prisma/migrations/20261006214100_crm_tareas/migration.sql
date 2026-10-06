-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('TODO', 'CALL', 'MESSAGE', 'EMAIL', 'MEETING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_ASSIGNED';

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "auto_task_due_days" INTEGER,
ADD COLUMN     "auto_task_title" TEXT;

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "kind" "TaskKind" NOT NULL DEFAULT 'TODO',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMP(3),
    "remind_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "assignee_id" TEXT,
    "created_by_id" TEXT,
    "person_id" TEXT,
    "company_id" TEXT,
    "deal_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "auto_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_organization_id_assignee_id_status_due_at_idx" ON "tasks"("organization_id", "assignee_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_person_id_status_idx" ON "tasks"("organization_id", "person_id", "status");

-- CreateIndex
CREATE INDEX "tasks_organization_id_deal_id_status_idx" ON "tasks"("organization_id", "deal_id", "status");

-- CreateIndex
CREATE INDEX "tasks_organization_id_company_id_status_idx" ON "tasks"("organization_id", "company_id", "status");

-- CreateIndex
CREATE INDEX "tasks_status_reminded_at_remind_at_idx" ON "tasks"("status", "reminded_at", "remind_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_deal_id_auto_key_key" ON "tasks"("deal_id", "auto_key");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Regla por defecto de los pipelines existentes: al ganar un negocio se crea
-- una tarea de seguimiento postventa a 7 días (igual que DEFAULT_STAGES en
-- lib/crm/pipelines.ts para las organizaciones nuevas). Solo etapas "Ganado"
-- sembradas por la migración de negocios (id stg_<org>_won) o por la app con
-- ese nombre; las que el cliente ya personalizó con otro nombre no se tocan.
UPDATE "pipeline_stages"
SET "auto_task_title" = 'Seguimiento postventa', "auto_task_due_days" = 7
WHERE "outcome" = 'WON' AND "name" = 'Ganado' AND "auto_task_title" IS NULL;
