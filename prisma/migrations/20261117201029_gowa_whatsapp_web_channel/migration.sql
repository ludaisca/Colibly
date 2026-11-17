-- AlterEnum
ALTER TYPE "Channel" ADD VALUE 'WHATSAPP_WEB';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "channel_whatsapp_web_enabled" BOOLEAN NOT NULL DEFAULT false;

