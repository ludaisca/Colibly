-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "is_sample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "organization_id" TEXT;

-- CreateIndex
CREATE INDEX "contacts_organization_id_is_sample_idx" ON "contacts"("organization_id", "is_sample");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contactos y etiquetas "sin canal": únicos por organización solo entre los que
-- no cuelgan de ninguna cuenta (Prisma no modela índices únicos parciales).
CREATE UNIQUE INDEX "contacts_org_remote_jid_orphan_key" ON "contacts" ("organization_id", "remoteJid") WHERE "accountId" IS NULL AND "channelAccountId" IS NULL;
CREATE UNIQUE INDEX "tags_org_name_orphan_key" ON "tags" ("organization_id", "name") WHERE "waAccountId" IS NULL AND "channelAccountId" IS NULL;
