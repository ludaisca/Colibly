-- CreateEnum
CREATE TYPE "ChatPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "priority" "ChatPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "snoozed_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "priority" "ChatPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "snoozed_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversations_channelAccountId_status_priority_idx" ON "conversations"("channelAccountId", "status", "priority");

-- CreateIndex
CREATE INDEX "conversations_channelAccountId_snoozed_until_idx" ON "conversations"("channelAccountId", "snoozed_until");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_status_priority_idx" ON "wa_chats"("accountId", "status", "priority");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_snoozed_until_idx" ON "wa_chats"("accountId", "snoozed_until");

