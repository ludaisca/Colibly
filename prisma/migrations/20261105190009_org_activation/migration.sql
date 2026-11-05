-- CreateTable
CREATE TABLE "org_activations" (
    "organization_id" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "channel_at" TIMESTAMP(3),
    "first_inbound_at" TIMESTAMP(3),
    "first_reply_at" TIMESTAMP(3),
    "automation_at" TIMESTAMP(3),
    "team_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nudges_sent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_nudge_at" TIMESTAMP(3),
    "nudges_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_activations_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "org_activations_checked_at_idx" ON "org_activations"("checked_at");

-- AddForeignKey
ALTER TABLE "org_activations" ADD CONSTRAINT "org_activations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

