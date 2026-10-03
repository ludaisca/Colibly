-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "reactionAt" TIMESTAMP(3),
ADD COLUMN     "reactionEmoji" TEXT,
ADD COLUMN     "replyToWamid" TEXT;

-- CreateIndex
CREATE INDEX "wa_messages_chatId_replyToWamid_idx" ON "wa_messages"("chatId", "replyToWamid");

