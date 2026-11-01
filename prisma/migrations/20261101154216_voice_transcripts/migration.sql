-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "transcribed_at" TIMESTAMP(3),
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "auto_transcribe_audio" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "transcribed_at" TIMESTAMP(3),
ADD COLUMN     "transcript" TEXT;

