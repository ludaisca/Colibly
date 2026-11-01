-- CreateEnum
CREATE TYPE "ChatCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "wa_chats" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "chat_custom_field_definitions" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT,
    "channelAccountId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ChatCustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_custom_field_definitions_waAccountId_order_idx" ON "chat_custom_field_definitions"("waAccountId", "order");

-- CreateIndex
CREATE INDEX "chat_custom_field_definitions_channelAccountId_order_idx" ON "chat_custom_field_definitions"("channelAccountId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "chat_custom_field_definitions_waAccountId_key_key" ON "chat_custom_field_definitions"("waAccountId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "chat_custom_field_definitions_channelAccountId_key_key" ON "chat_custom_field_definitions"("channelAccountId", "key");

-- AddForeignKey
ALTER TABLE "chat_custom_field_definitions" ADD CONSTRAINT "chat_custom_field_definitions_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_custom_field_definitions" ADD CONSTRAINT "chat_custom_field_definitions_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

