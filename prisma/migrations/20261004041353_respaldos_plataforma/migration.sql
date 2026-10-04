-- CreateEnum
CREATE TYPE "PlatformBackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PlatformBackupTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "backup_access_key_id" TEXT,
ADD COLUMN     "backup_bucket" TEXT,
ADD COLUMN     "backup_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backup_endpoint" TEXT,
ADD COLUMN     "backup_hour" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "backup_include_media" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backup_prefix" TEXT,
ADD COLUMN     "backup_region" TEXT,
ADD COLUMN     "backup_secret_access_key" TEXT;

-- CreateTable
CREATE TABLE "platform_backup_runs" (
    "id" TEXT NOT NULL,
    "trigger" "PlatformBackupTrigger" NOT NULL,
    "status" "PlatformBackupStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "db_bytes" BIGINT,
    "media_bytes" BIGINT,
    "error" TEXT,
    "triggered_by" TEXT,

    CONSTRAINT "platform_backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_backup_runs_started_at_idx" ON "platform_backup_runs"("started_at");

