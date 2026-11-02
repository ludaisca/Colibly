-- AlterTable
ALTER TABLE "users" ADD COLUMN     "message_signature" TEXT,
ADD COLUMN     "signature_enabled" BOOLEAN NOT NULL DEFAULT false;

