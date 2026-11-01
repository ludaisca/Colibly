-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "waiting_since" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "waiting_since" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversations_channelAccountId_waiting_since_idx" ON "conversations"("channelAccountId", "waiting_since");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_waiting_since_idx" ON "wa_chats"("accountId", "waiting_since");

