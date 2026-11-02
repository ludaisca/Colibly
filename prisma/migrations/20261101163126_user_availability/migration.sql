-- CreateEnum
CREATE TYPE "UserAvailability" AS ENUM ('ONLINE', 'BUSY', 'OFFLINE');

-- AlterTable
ALTER TABLE "channel_accounts" ADD COLUMN     "auto_assign_online_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "availability" "UserAvailability" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "auto_assign_online_only" BOOLEAN NOT NULL DEFAULT false;

