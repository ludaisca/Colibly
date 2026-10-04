-- CreateEnum
CREATE TYPE "WAConnectionType" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "meta_app_id" TEXT,
ADD COLUMN     "meta_app_secret" TEXT,
ADD COLUMN     "meta_embedded_signup_config_id" TEXT,
ADD COLUMN     "meta_webhook_verify_token" TEXT;

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "connection_type" "WAConnectionType" NOT NULL DEFAULT 'MANUAL';

