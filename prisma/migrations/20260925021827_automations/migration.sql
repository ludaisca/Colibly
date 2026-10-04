-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('ACTIVE', 'WAITING_DELAY', 'WAITING_REPLY', 'PAUSED_BY_AGENT', 'HANDED_OFF', 'HANDED_TO_BOT', 'COMPLETED', 'EXITED_REPLY', 'EXPIRED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "interactive_payload" JSONB;

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "wa_account_id" TEXT,
    "channel_account_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "draft_graph" JSONB NOT NULL,
    "trigger_type" TEXT,
    "trigger_config" JSONB,
    "conversational" BOOLEAN NOT NULL DEFAULT false,
    "published_version_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_versions" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_id" TEXT NOT NULL,

    CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "wa_chat_id" TEXT,
    "conversation_id" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "conversational" BOOLEAN NOT NULL DEFAULT false,
    "current_node_id" TEXT,
    "vars" JSONB NOT NULL DEFAULT '{}',
    "waiting" JSONB,
    "pending_input" JSONB,
    "next_run_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_run_logs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_id" TEXT,
    "node_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automations_published_version_id_key" ON "automations"("published_version_id");

-- CreateIndex
CREATE INDEX "automations_wa_account_id_status_trigger_type_idx" ON "automations"("wa_account_id", "status", "trigger_type");

-- CreateIndex
CREATE INDEX "automations_channel_account_id_status_trigger_type_idx" ON "automations"("channel_account_id", "status", "trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "automation_versions_automation_id_version_key" ON "automation_versions"("automation_id", "version");

-- CreateIndex
CREATE INDEX "automation_runs_status_next_run_at_idx" ON "automation_runs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "automation_runs_wa_chat_id_status_idx" ON "automation_runs"("wa_chat_id", "status");

-- CreateIndex
CREATE INDEX "automation_runs_conversation_id_status_idx" ON "automation_runs"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "automation_runs_automation_id_contact_id_status_idx" ON "automation_runs"("automation_id", "contact_id", "status");

-- CreateIndex
CREATE INDEX "automation_runs_contact_id_started_at_idx" ON "automation_runs"("contact_id", "started_at");

-- CreateIndex
CREATE INDEX "automation_run_logs_run_id_at_idx" ON "automation_run_logs"("run_id", "at");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_wa_account_id_fkey" FOREIGN KEY ("wa_account_id") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "automation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "automation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_wa_chat_id_fkey" FOREIGN KEY ("wa_chat_id") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run_logs" ADD CONSTRAINT "automation_run_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

