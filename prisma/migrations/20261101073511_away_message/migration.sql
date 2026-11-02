-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "away_message_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "away_message_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "away_message_text" TEXT,
ADD COLUMN     "business_days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "away_message_sent_at" TIMESTAMP(3);

