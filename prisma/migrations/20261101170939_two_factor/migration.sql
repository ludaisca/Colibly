-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "two_factor_enabled_at" TIMESTAMP(3),
ADD COLUMN     "two_factor_last_step" INTEGER,
ADD COLUMN     "two_factor_pending_secret" TEXT,
ADD COLUMN     "two_factor_secret" TEXT;

