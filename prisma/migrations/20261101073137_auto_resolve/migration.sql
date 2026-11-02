-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "auto_resolve_after_hours" INTEGER,
ADD COLUMN     "auto_resolve_message" TEXT,
ADD COLUMN     "auto_resolve_skip_waiting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "auto_resolve_tag_name" TEXT;

