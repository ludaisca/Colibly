-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "agentReactionEmoji" TEXT;

-- CreateTable
CREATE TABLE "wa_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "wamid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "senderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_stickers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_reactions_wamid_key" ON "wa_reactions"("wamid");

-- CreateIndex
CREATE INDEX "wa_reactions_messageId_createdAt_idx" ON "wa_reactions"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wa_stickers_organizationId_sha256_key" ON "wa_stickers"("organizationId", "sha256");

-- AddForeignKey
ALTER TABLE "wa_reactions" ADD CONSTRAINT "wa_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "wa_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_stickers" ADD CONSTRAINT "wa_stickers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

