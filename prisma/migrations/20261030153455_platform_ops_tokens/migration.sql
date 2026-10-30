-- CreateTable
CREATE TABLE "platform_api_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['platform:read']::TEXT[],
    "environment" TEXT NOT NULL,
    "allowed_cidrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_email" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_log" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_email" TEXT,
    "token_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_oauth_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "grant_types" TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_oauth_codes" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "operator_email" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" TEXT NOT NULL DEFAULT 'S256',
    "resource" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_oauth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_oauth_tokens" (
    "id" TEXT NOT NULL,
    "access_hash" TEXT NOT NULL,
    "refresh_hash" TEXT,
    "family_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "operator_email" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resource" TEXT,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_health_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "notified_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "platform_health_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_api_tokens_token_hash_key" ON "platform_api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "platform_api_tokens_revoked_at_idx" ON "platform_api_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "platform_audit_log_action_idx" ON "platform_audit_log"("action");

-- CreateIndex
CREATE INDEX "platform_audit_log_target_id_idx" ON "platform_audit_log"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_oauth_clients_client_id_key" ON "platform_oauth_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_oauth_codes_code_hash_key" ON "platform_oauth_codes"("code_hash");

-- CreateIndex
CREATE INDEX "platform_oauth_codes_expires_at_idx" ON "platform_oauth_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_oauth_tokens_access_hash_key" ON "platform_oauth_tokens"("access_hash");

-- CreateIndex
CREATE UNIQUE INDEX "platform_oauth_tokens_refresh_hash_key" ON "platform_oauth_tokens"("refresh_hash");

-- CreateIndex
CREATE INDEX "platform_oauth_tokens_client_id_idx" ON "platform_oauth_tokens"("client_id");

-- CreateIndex
CREATE INDEX "platform_oauth_tokens_family_id_idx" ON "platform_oauth_tokens"("family_id");

-- CreateIndex
CREATE INDEX "platform_oauth_tokens_revoked_at_idx" ON "platform_oauth_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "platform_health_runs_started_at_idx" ON "platform_health_runs"("started_at");

