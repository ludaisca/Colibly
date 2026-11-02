-- CreateEnum
CREATE TYPE "AiAssistKind" AS ENUM ('REWRITE', 'TASK', 'TRANSCRIBE', 'MONITOR');

-- CreateTable
CREATE TABLE "ai_assist_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "AiAssistKind" NOT NULL,
    "user_id" TEXT,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assist_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_assist_usage_organization_id_created_at_idx" ON "ai_assist_usage"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_assist_usage" ADD CONSTRAINT "ai_assist_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

