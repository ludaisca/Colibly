-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "agent_reaction_emoji" TEXT,
ADD COLUMN     "reaction_emoji" TEXT,
ADD COLUMN     "reply_to_external_id" TEXT;

