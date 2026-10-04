-- AlterTable
ALTER TABLE "automation_runs" ADD COLUMN     "input_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "automation_ai_usage" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "run_id" TEXT,
    "user_id" TEXT NOT NULL,
    "wa_chat_id" TEXT,
    "conversation_id" TEXT,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_ai_usage_user_id_created_at_idx" ON "automation_ai_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "automation_ai_usage_wa_chat_id_idx" ON "automation_ai_usage"("wa_chat_id");

-- CreateIndex
CREATE INDEX "automation_ai_usage_conversation_id_idx" ON "automation_ai_usage"("conversation_id");

-- AddForeignKey
ALTER TABLE "automation_ai_usage" ADD CONSTRAINT "automation_ai_usage_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_ai_usage" ADD CONSTRAINT "automation_ai_usage_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

