-- CreateEnum
CREATE TYPE "WACoexistenceSyncStatus" AS ENUM ('NONE', 'PENDING', 'CONTACTS_REQUESTED', 'HISTORY_REQUESTED', 'COMPLETED', 'HISTORY_DECLINED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "WAMessageOrigin" AS ENUM ('API', 'BUSINESS_APP_ECHO', 'HISTORY');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "whatsapp_coexistence_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "business_app_onboarded_at" TIMESTAMP(3),
ADD COLUMN     "coexistence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disconnected_reason" TEXT,
ADD COLUMN     "meta_user_id" TEXT,
ADD COLUMN     "sync_deadline_at" TIMESTAMP(3),
ADD COLUMN     "sync_error" TEXT,
ADD COLUMN     "sync_progress" INTEGER,
ADD COLUMN     "sync_request_ids" JSONB,
ADD COLUMN     "sync_status" "WACoexistenceSyncStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "token_alerted_at" TIMESTAMP(3),
ADD COLUMN     "token_expires_at" TIMESTAMP(3),
ADD COLUMN     "two_step_pin" TEXT;

-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "origin" "WAMessageOrigin" NOT NULL DEFAULT 'API';

-- CreateTable
CREATE TABLE "meta_data_deletion_requests" (
    "id" TEXT NOT NULL,
    "confirmation_code" TEXT NOT NULL,
    "meta_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "accounts_deleted" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "meta_data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_data_deletion_requests_confirmation_code_key" ON "meta_data_deletion_requests"("confirmation_code");

-- CreateIndex
CREATE INDEX "meta_data_deletion_requests_meta_user_id_idx" ON "meta_data_deletion_requests"("meta_user_id");

-- CreateIndex
CREATE INDEX "wa_accounts_sync_status_sync_deadline_at_idx" ON "wa_accounts"("sync_status", "sync_deadline_at");

-- CreateIndex
CREATE INDEX "wa_accounts_meta_user_id_idx" ON "wa_accounts"("meta_user_id");

