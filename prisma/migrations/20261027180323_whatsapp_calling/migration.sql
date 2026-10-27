-- CreateEnum
CREATE TYPE "WACallDirection" AS ENUM ('USER_INITIATED', 'BUSINESS_INITIATED');

-- CreateEnum
CREATE TYPE "WACallStatus" AS ENUM ('RINGING', 'CONNECTING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WHATSAPP_CALL';

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "calling_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "wa_calls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chatId" TEXT,
    "contactId" TEXT,
    "meta_call_id" TEXT NOT NULL,
    "direction" "WACallDirection" NOT NULL,
    "status" "WACallStatus" NOT NULL DEFAULT 'RINGING',
    "peer_wa_id" TEXT,
    "peer_name" TEXT,
    "sdpOffer" TEXT,
    "sdpAnswer" TEXT,
    "answered_by_id" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "end_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_calls_meta_call_id_key" ON "wa_calls"("meta_call_id");

-- CreateIndex
CREATE INDEX "wa_calls_accountId_status_idx" ON "wa_calls"("accountId", "status");

-- CreateIndex
CREATE INDEX "wa_calls_organization_id_created_at_idx" ON "wa_calls"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "wa_calls" ADD CONSTRAINT "wa_calls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_calls" ADD CONSTRAINT "wa_calls_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_calls" ADD CONSTRAINT "wa_calls_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "wa_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_calls" ADD CONSTRAINT "wa_calls_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_calls" ADD CONSTRAINT "wa_calls_answered_by_id_fkey" FOREIGN KEY ("answered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

