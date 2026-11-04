-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "can_send_message" TEXT,
ADD COLUMN     "health_checked_at" TIMESTAMP(3),
ADD COLUMN     "health_notices" JSONB,
ADD COLUMN     "name_status" TEXT,
ADD COLUMN     "quality_event" TEXT;

