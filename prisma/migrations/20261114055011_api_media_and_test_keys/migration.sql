-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "test" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "api_media" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "bytes_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_media_organization_id_idx" ON "api_media"("organization_id");

-- CreateIndex
CREATE INDEX "api_media_expires_at_idx" ON "api_media"("expires_at");

-- AddForeignKey
ALTER TABLE "api_media" ADD CONSTRAINT "api_media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

