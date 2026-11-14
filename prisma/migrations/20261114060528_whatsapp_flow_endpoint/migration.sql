-- AlterTable
ALTER TABLE "wa_accounts" ADD COLUMN     "flow_endpoint_secret" TEXT,
ADD COLUMN     "flow_endpoint_url" TEXT,
ADD COLUMN     "flow_key_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "flow_private_key" TEXT;

