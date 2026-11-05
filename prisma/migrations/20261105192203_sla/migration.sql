-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SLA_BREACH';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "opened_at" TIMESTAMP(3),
ADD COLUMN     "sla_resolution_breached_for" TIMESTAMP(3),
ADD COLUMN     "sla_response_breached_for" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "sla_business_hours_only" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sla_enabled_at" TIMESTAMP(3),
ADD COLUMN     "sla_resolution_hours" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "sla_response_minutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "opened_at" TIMESTAMP(3),
ADD COLUMN     "sla_resolution_breached_for" TIMESTAMP(3),
ADD COLUMN     "sla_response_breached_for" TIMESTAMP(3);

