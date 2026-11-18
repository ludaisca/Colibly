-- AlterTable
ALTER TABLE "channel_accounts" ADD COLUMN     "groups_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "sender_external_id" TEXT,
ADD COLUMN     "sender_name" TEXT;

