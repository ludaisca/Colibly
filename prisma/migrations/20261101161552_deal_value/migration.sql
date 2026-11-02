-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "deal_value_cents" INTEGER,
ADD COLUMN     "expected_close_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lead_outcome_events" ADD COLUMN     "value_cents" INTEGER;

