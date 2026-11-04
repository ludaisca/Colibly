-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "meta_user_id" TEXT;

-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "content" JSONB,
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "pricing" JSONB,
ADD COLUMN     "read_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contacts_accountId_meta_user_id_idx" ON "contacts"("accountId", "meta_user_id");

