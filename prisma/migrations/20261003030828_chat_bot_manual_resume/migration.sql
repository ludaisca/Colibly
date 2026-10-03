-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "botResumedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "botResumedAt" TIMESTAMP(3);

