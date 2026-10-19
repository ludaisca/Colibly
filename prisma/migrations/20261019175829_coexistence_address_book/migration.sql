-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "name_source" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "history_skipped_chats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "history_skipped_messages" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "wa_address_book" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_address_book_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_address_book_account_id_phone_key" ON "wa_address_book"("account_id", "phone");

-- AddForeignKey
ALTER TABLE "wa_address_book" ADD CONSTRAINT "wa_address_book_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

