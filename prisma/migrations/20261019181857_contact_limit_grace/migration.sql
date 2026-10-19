-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "over_limit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "contact_alert_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contact_alert_period" TEXT;

