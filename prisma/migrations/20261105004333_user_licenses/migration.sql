-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN     "license" "PlanId";

-- AlterTable
ALTER TABLE "channel_accounts" ADD COLUMN     "owner_id" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "legacy_until" TIMESTAMP(3),
ADD COLUMN     "licenses_business" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "licenses_essential" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "licenses_pro" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "topic_monitors" ADD COLUMN     "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_credits_alert_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_credits_bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_credits_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "license" "PlanId" NOT NULL DEFAULT 'PRO';

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_owner_id_channel_key" ON "channel_accounts"("owner_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "wa_accounts_owner_id_key" ON "wa_accounts"("owner_id");

-- AddForeignKey
ALTER TABLE "wa_accounts" ADD CONSTRAINT "wa_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_monitors" ADD CONSTRAINT "topic_monitors_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

