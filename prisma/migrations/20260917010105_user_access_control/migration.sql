-- AlterTable
ALTER TABLE "system_config" ALTER COLUMN "allowRegistration" SET DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled_at" TIMESTAMP(3),
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

