-- CreateIndex
CREATE INDEX "conversations_channelAccountId_created_at_idx" ON "conversations"("channelAccountId", "created_at");

-- CreateIndex
CREATE INDEX "conversations_channelAccountId_resolvedAt_idx" ON "conversations"("channelAccountId", "resolvedAt");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_created_at_idx" ON "wa_chats"("accountId", "created_at");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_resolvedAt_idx" ON "wa_chats"("accountId", "resolvedAt");

