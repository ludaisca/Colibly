-- CreateEnum
CREATE TYPE "WAOnboardingLinkStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "wa_onboarding_links" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "name" TEXT,
    "reference" TEXT,
    "redirect_url" TEXT,
    "status" "WAOnboardingLinkStatus" NOT NULL DEFAULT 'PENDING',
    "account_id" TEXT,
    "last_error" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_onboarding_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_onboarding_links_token_hash_key" ON "wa_onboarding_links"("token_hash");

-- CreateIndex
CREATE INDEX "wa_onboarding_links_organization_id_created_at_idx" ON "wa_onboarding_links"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "wa_onboarding_links" ADD CONSTRAINT "wa_onboarding_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_onboarding_links" ADD CONSTRAINT "wa_onboarding_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

