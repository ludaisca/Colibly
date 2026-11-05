-- AlterTable
ALTER TABLE "webhook_endpoints" ADD COLUMN     "previous_secret" TEXT,
ADD COLUMN     "previous_secret_expires_at" TIMESTAMP(3);

