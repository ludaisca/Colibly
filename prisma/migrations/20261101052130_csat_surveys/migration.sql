-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "csat_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "csat_responses" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csat_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_chat_id_key" ON "csat_responses"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_token_key" ON "csat_responses"("token");

-- CreateIndex
CREATE INDEX "csat_responses_account_id_created_at_idx" ON "csat_responses"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "csat_responses_assigned_to_id_created_at_idx" ON "csat_responses"("assigned_to_id", "created_at");

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

