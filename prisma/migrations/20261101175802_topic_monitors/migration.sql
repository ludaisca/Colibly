-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "topic_monitor_scan_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "topic_monitors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_matches" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "chat_kind" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "evidence_message_ids" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_monitors_organization_id_idx" ON "topic_monitors"("organization_id");

-- CreateIndex
CREATE INDEX "topic_matches_monitor_id_created_at_idx" ON "topic_matches"("monitor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "topic_matches_monitor_id_chat_id_key" ON "topic_matches"("monitor_id", "chat_id");

-- AddForeignKey
ALTER TABLE "topic_monitors" ADD CONSTRAINT "topic_monitors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_matches" ADD CONSTRAINT "topic_matches_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "topic_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

