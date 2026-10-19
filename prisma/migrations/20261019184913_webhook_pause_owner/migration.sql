-- AlterTable
ALTER TABLE "webhook_endpoints" ADD COLUMN     "paused_at" TIMESTAMP(3),
ADD COLUMN     "paused_reason" TEXT;

