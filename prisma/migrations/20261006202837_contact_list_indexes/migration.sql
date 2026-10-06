-- CreateIndex
CREATE INDEX "contacts_channelAccountId_leadStatus_idx" ON "contacts"("channelAccountId", "leadStatus");

-- CreateIndex
CREATE INDEX "contacts_accountId_updated_at_idx" ON "contacts"("accountId", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_channelAccountId_updated_at_idx" ON "contacts"("channelAccountId", "updated_at" DESC);

