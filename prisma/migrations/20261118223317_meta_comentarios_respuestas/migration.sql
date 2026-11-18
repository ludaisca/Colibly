-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "comment_post_id" TEXT,
ADD COLUMN     "comment_reply_kind" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "alias_external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channelAccountId_alias_external_id_key" ON "conversations"("channelAccountId", "alias_external_id");

