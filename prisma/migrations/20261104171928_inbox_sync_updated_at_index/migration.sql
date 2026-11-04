-- CreateIndex
CREATE INDEX "conversations_channelAccountId_updated_at_idx" ON "conversations"("channelAccountId", "updated_at");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_updated_at_idx" ON "wa_chats"("accountId", "updated_at");

