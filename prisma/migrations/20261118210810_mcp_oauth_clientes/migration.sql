-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "oauth_client_id" TEXT;

-- CreateTable
CREATE TABLE "mcp_oauth_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_codes" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "test" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_tokens" (
    "id" TEXT NOT NULL,
    "access_hash" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_clients_client_id_key" ON "mcp_oauth_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_codes_code_hash_key" ON "mcp_oauth_codes"("code_hash");

-- CreateIndex
CREATE INDEX "mcp_oauth_codes_expires_at_idx" ON "mcp_oauth_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_tokens_access_hash_key" ON "mcp_oauth_tokens"("access_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_tokens_refresh_hash_key" ON "mcp_oauth_tokens"("refresh_hash");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_family_id_idx" ON "mcp_oauth_tokens"("family_id");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_api_key_id_idx" ON "mcp_oauth_tokens"("api_key_id");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_refresh_expires_at_idx" ON "mcp_oauth_tokens"("refresh_expires_at");

-- AddForeignKey
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

