-- Migración base (baseline) — generada 2026-09-16 con
-- `prisma migrate diff --from-empty --to-schema-datamodel` a partir del schema
-- de main @ 273c0bb, el que producción tenía al pasar de `db push` a
-- `prisma migrate`. En una base que ya existía (creada con db push) NO se
-- ejecuta: scripts/db-migrate.sh la marca como aplicada. Solo corre completa
-- en una base vacía.

-- pgvector: la columna wa_bot_knowledge.embedding es vector(768).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ContactCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "WAChannel" AS ENUM ('META_CLOUD');

-- CreateEnum
CREATE TYPE "WaAccountStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('TELEGRAM', 'MESSENGER', 'INSTAGRAM', 'WEBCHAT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "BotMemoryType" AS ENUM ('NONE', 'RECENT', 'SUMMARY');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CUSTOMER', 'LOST');

-- CreateEnum
CREATE TYPE "LeadOrigin" AS ENUM ('ORGANIC', 'INSTANT_FORM', 'CTWA');

-- CreateEnum
CREATE TYPE "MetaEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MetaAdsAccountMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "WAAppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "WAAppointmentSource" AS ENUM ('MANUAL', 'AI_BOT');

-- CreateEnum
CREATE TYPE "RoutingConditionType" AS ENUM ('TAG', 'LEAD_ORIGIN', 'SCORE_LABEL');

-- CreateEnum
CREATE TYPE "SequenceTriggerType" AS ENUM ('TAG_ADDED', 'LEAD_STATUS_CHANGED', 'APPOINTMENT_COMPLETED');

-- CreateEnum
CREATE TYPE "SequenceEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED_REPLY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CHAT_MESSAGE', 'CAMPAIGN_COMPLETED', 'CAMPAIGN_FAILED', 'BOT_ERROR', 'BUDGET_EXCEEDED', 'ACCOUNT_STATUS', 'APPOINTMENT_REMINDER', 'APPOINTMENT_PROPOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "maxOpenChats" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allowRegistration" BOOLEAN NOT NULL DEFAULT true,
    "businessName" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openrouterApiKey" TEXT,
    "googleApiKey" TEXT,
    "defaultProvider" TEXT NOT NULL DEFAULT 'openrouter',
    "defaultModel" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
    "monthlyBudgetUsd" DOUBLE PRECISION,
    "budgetAlertMonth" TEXT,
    "leadRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leadRecoveryFirstMessageHours" INTEGER NOT NULL DEFAULT 2,
    "leadRecoverySecondMessageHours" INTEGER DEFAULT 12,
    "leadRecoveryBusinessHourStart" INTEGER NOT NULL DEFAULT 8,
    "leadRecoveryBusinessHourEnd" INTEGER NOT NULL DEFAULT 20,
    "leadRecoveryTimezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "WAChannel" NOT NULL DEFAULT 'META_CLOUD',
    "phoneNumber" TEXT,
    "phoneNumberId" TEXT,
    "wabaId" TEXT,
    "appId" TEXT,
    "accessToken" TEXT,
    "verifyTokenHash" TEXT,
    "appSecret" TEXT,
    "status" "WaAccountStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "lastActivity" TIMESTAMP(3),
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "qualityRating" TEXT,
    "messagingTier" TEXT,
    "qualityUpdatedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT,
    "channelAccountId" TEXT,
    "shortcut" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_custom_field_definitions" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT,
    "channelAccountId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ContactCustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_custom_field_values" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_account_shares" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "wa_account_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WaAccountStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "credentials" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "verifyTokenHash" TEXT,
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastActivity" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_account_shares" (
    "id" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "channel_account_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "contactId" TEXT,
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ChatStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "messageType" TEXT NOT NULL,
    "body" TEXT,
    "caption" TEXT,
    "mediaId" TEXT,
    "mediaUrl" TEXT,
    "mimeType" TEXT,
    "filename" TEXT,
    "bytesSize" INTEGER,
    "status" TEXT,
    "senderId" TEXT,
    "is_from_comment" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_chats" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "contactId" TEXT,
    "assignedToId" TEXT,
    "status" "ChatStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_lead_scorer_bots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleIntervalMinutes" INTEGER,
    "scheduleAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleChannelAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_lead_scorer_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_lead_scorer_usage" (
    "id" TEXT NOT NULL,
    "scorerId" TEXT NOT NULL,
    "waChatId" TEXT,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_lead_scorer_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_lead_scores" (
    "id" TEXT NOT NULL,
    "chatId" TEXT,
    "conversationId" TEXT,
    "scorerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "details" JSONB,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "wamid" TEXT,
    "chatId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "messageType" TEXT NOT NULL,
    "body" TEXT,
    "caption" TEXT,
    "mediaId" TEXT,
    "mediaUrl" TEXT,
    "mimeType" TEXT,
    "filename" TEXT,
    "bytesSize" INTEGER,
    "interactivePayload" JSONB,
    "referral" JSONB,
    "status" TEXT,
    "senderId" TEXT,
    "campaignId" TEXT,
    "leadSheetSourceId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_lead_recovery_attempts" (
    "id" TEXT NOT NULL,
    "chatId" TEXT,
    "conversationId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "messageId" TEXT,
    "channelMessageId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_lead_recovery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_templates" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sheet_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "waTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "phoneColumn" TEXT NOT NULL,
    "nameColumn" TEXT,
    "bodyColumns" JSONB NOT NULL,
    "headerParam" TEXT,
    "buttonParam" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastImportedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_sheet_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sheet_imported_rows" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "contactName" TEXT,
    "status" TEXT NOT NULL,
    "wamid" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sheet_imported_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_campaigns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "waTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "headerParam" TEXT,
    "buttonParam" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "contactName" TEXT,
    "wamid" TEXT,
    "parameters" JSONB,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "wa_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_bots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waAccountId" TEXT,
    "channelAccountId" TEXT,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "memoryType" "BotMemoryType" NOT NULL DEFAULT 'RECENT',
    "memoryLimit" INTEGER NOT NULL DEFAULT 20,
    "ragEnabled" BOOLEAN NOT NULL DEFAULT false,
    "humanizeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "appointmentSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "status" "BotStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_bot_conversations" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "waChatId" TEXT,
    "conversationId" TEXT,
    "summary" TEXT,

    CONSTRAINT "wa_bot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_bot_knowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "sourceName" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_bot_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_bot_knowledge_bots" (
    "knowledgeId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,

    CONSTRAINT "wa_bot_knowledge_bots_pkey" PRIMARY KEY ("knowledgeId","botId")
);

-- CreateTable
CREATE TABLE "wa_bot_usage" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "waChatId" TEXT,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_bot_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "channelAccountId" TEXT,
    "remoteJid" TEXT NOT NULL,
    "name" TEXT,
    "realName" TEXT,
    "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "optedOutMarketing" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "leadOrigin" "LeadOrigin" NOT NULL DEFAULT 'ORGANIC',
    "metaLeadId" TEXT,
    "ctwaClid" TEXT,
    "adId" TEXT,
    "metaAdsAccountId" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ads_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageAccessToken" TEXT,
    "appSecret" TEXT,
    "verifyTokenHash" TEXT,
    "datasetId" TEXT,
    "capiAccessToken" TEXT,
    "waAccountId" TEXT,
    "status" "WaAccountStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "mode" "MetaAdsAccountMode" NOT NULL DEFAULT 'TEST',
    "testEventCode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ads_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_conversion_events" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "metaAdsAccountId" TEXT NOT NULL,
    "leadStatus" "LeadStatus" NOT NULL,
    "eventName" TEXT NOT NULL,
    "metaEventId" TEXT NOT NULL,
    "status" "MetaEventStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'accent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "chat_tags" (
    "id" TEXT NOT NULL,
    "chatId" TEXT,
    "conversationId" TEXT,
    "tagId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_notes" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_appointments" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "status" "WAAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "WAAppointmentSource" NOT NULL DEFAULT 'MANUAL',
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "originMessageId" TEXT,
    "reminder_minutes_before" INTEGER NOT NULL DEFAULT 60,
    "reminded_at" TIMESTAMP(3),
    "cancelReason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_account_routing_rules" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "conditionType" "RoutingConditionType" NOT NULL,
    "conditionValue" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_account_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_sequences" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT,
    "channelAccountId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "SequenceTriggerType" NOT NULL,
    "triggerValue" TEXT,
    "exitOnReply" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_sequence_steps" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,

    CONSTRAINT "wa_sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_sequence_enrollments" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "SequenceEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3),
    "last_step_sent_at" TIMESTAMP(3),
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_sequence_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_userId_key" ON "app_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_userId_key" ON "google_accounts"("userId");

-- CreateIndex
CREATE INDEX "wa_accounts_phoneNumberId_idx" ON "wa_accounts"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_accounts_phoneNumberId_key" ON "wa_accounts"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_accounts_userId_name_key" ON "wa_accounts"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "canned_responses_waAccountId_shortcut_key" ON "canned_responses"("waAccountId", "shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "canned_responses_channelAccountId_shortcut_key" ON "canned_responses"("channelAccountId", "shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "contact_custom_field_definitions_waAccountId_key_key" ON "contact_custom_field_definitions"("waAccountId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "contact_custom_field_definitions_channelAccountId_key_key" ON "contact_custom_field_definitions"("channelAccountId", "key");

-- CreateIndex
CREATE INDEX "contact_custom_field_values_definitionId_idx" ON "contact_custom_field_values"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_custom_field_values_contactId_definitionId_key" ON "contact_custom_field_values"("contactId", "definitionId");

-- CreateIndex
CREATE INDEX "wa_account_shares_userId_idx" ON "wa_account_shares"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_account_shares_waAccountId_userId_key" ON "wa_account_shares"("waAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_userId_name_key" ON "channel_accounts"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_channel_externalAccountId_key" ON "channel_accounts"("channel", "externalAccountId");

-- CreateIndex
CREATE INDEX "channel_account_shares_userId_idx" ON "channel_account_shares"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_account_shares_channelAccountId_userId_key" ON "channel_account_shares"("channelAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_contactId_key" ON "conversations"("contactId");

-- CreateIndex
CREATE INDEX "conversations_assignedToId_idx" ON "conversations"("assignedToId");

-- CreateIndex
CREATE INDEX "conversations_channelAccountId_lastMessageAt_idx" ON "conversations"("channelAccountId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channelAccountId_externalId_key" ON "conversations"("channelAccountId", "externalId");

-- CreateIndex
CREATE INDEX "channel_messages_conversationId_timestamp_idx" ON "channel_messages"("conversationId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "channel_messages_conversationId_externalMessageId_key" ON "channel_messages"("conversationId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_chats_contactId_key" ON "wa_chats"("contactId");

-- CreateIndex
CREATE INDEX "wa_chats_assignedToId_idx" ON "wa_chats"("assignedToId");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_lastMessageAt_idx" ON "wa_chats"("accountId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "wa_chats_accountId_status_idx" ON "wa_chats"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wa_chats_accountId_remoteJid_key" ON "wa_chats"("accountId", "remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "wa_lead_scorer_bots_userId_name_key" ON "wa_lead_scorer_bots"("userId", "name");

-- CreateIndex
CREATE INDEX "wa_lead_scorer_usage_scorerId_created_at_idx" ON "wa_lead_scorer_usage"("scorerId", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wa_lead_scores_chatId_scorerId_key" ON "wa_lead_scores"("chatId", "scorerId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_lead_scores_conversationId_scorerId_key" ON "wa_lead_scores"("conversationId", "scorerId");

-- CreateIndex
CREATE INDEX "wa_messages_wamid_idx" ON "wa_messages"("wamid");

-- CreateIndex
CREATE INDEX "wa_messages_chatId_timestamp_idx" ON "wa_messages"("chatId", "timestamp");

-- CreateIndex
CREATE INDEX "wa_messages_chatId_direction_idx" ON "wa_messages"("chatId", "direction");

-- CreateIndex
CREATE INDEX "wa_messages_campaignId_idx" ON "wa_messages"("campaignId");

-- CreateIndex
CREATE INDEX "wa_messages_leadSheetSourceId_idx" ON "wa_messages"("leadSheetSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_chatId_wamid_key" ON "wa_messages"("chatId", "wamid");

-- CreateIndex
CREATE UNIQUE INDEX "wa_lead_recovery_attempts_messageId_key" ON "wa_lead_recovery_attempts"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_lead_recovery_attempts_channelMessageId_key" ON "wa_lead_recovery_attempts"("channelMessageId");

-- CreateIndex
CREATE INDEX "wa_lead_recovery_attempts_chatId_created_at_idx" ON "wa_lead_recovery_attempts"("chatId", "created_at");

-- CreateIndex
CREATE INDEX "wa_lead_recovery_attempts_conversationId_created_at_idx" ON "wa_lead_recovery_attempts"("conversationId", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wa_templates_waAccountId_templateId_key" ON "wa_templates"("waAccountId", "templateId");

-- CreateIndex
CREATE INDEX "lead_sheet_sources_userId_idx" ON "lead_sheet_sources"("userId");

-- CreateIndex
CREATE INDEX "lead_sheet_sources_waAccountId_idx" ON "lead_sheet_sources"("waAccountId");

-- CreateIndex
CREATE INDEX "lead_sheet_imported_rows_wamid_idx" ON "lead_sheet_imported_rows"("wamid");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sheet_imported_rows_sourceId_phoneNumber_key" ON "lead_sheet_imported_rows"("sourceId", "phoneNumber");

-- CreateIndex
CREATE INDEX "wa_campaigns_userId_idx" ON "wa_campaigns"("userId");

-- CreateIndex
CREATE INDEX "wa_campaigns_waAccountId_idx" ON "wa_campaigns"("waAccountId");

-- CreateIndex
CREATE INDEX "wa_campaign_recipients_wamid_idx" ON "wa_campaign_recipients"("wamid");

-- CreateIndex
CREATE INDEX "wa_campaign_recipients_campaignId_status_idx" ON "wa_campaign_recipients"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wa_bots_userId_name_key" ON "wa_bots"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "wa_bot_conversations_botId_waChatId_key" ON "wa_bot_conversations"("botId", "waChatId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_bot_conversations_botId_conversationId_key" ON "wa_bot_conversations"("botId", "conversationId");

-- CreateIndex
CREATE INDEX "wa_bot_knowledge_bots_botId_idx" ON "wa_bot_knowledge_bots"("botId");

-- CreateIndex
CREATE INDEX "wa_bot_usage_botId_created_at_idx" ON "wa_bot_usage"("botId", "created_at");

-- CreateIndex
CREATE INDEX "contacts_accountId_leadStatus_idx" ON "contacts"("accountId", "leadStatus");

-- CreateIndex
CREATE INDEX "contacts_metaAdsAccountId_leadOrigin_idx" ON "contacts"("metaAdsAccountId", "leadOrigin");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_accountId_remoteJid_key" ON "contacts"("accountId", "remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_channelAccountId_remoteJid_key" ON "contacts"("channelAccountId", "remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_accounts_pageId_key" ON "meta_ads_accounts"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_accounts_userId_name_key" ON "meta_ads_accounts"("userId", "name");

-- CreateIndex
CREATE INDEX "meta_conversion_events_status_idx" ON "meta_conversion_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "meta_conversion_events_contactId_leadStatus_key" ON "meta_conversion_events"("contactId", "leadStatus");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "contact_tags_tagId_idx" ON "contact_tags"("tagId");

-- CreateIndex
CREATE INDEX "chat_tags_tagId_idx" ON "chat_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_tags_chatId_tagId_key" ON "chat_tags"("chatId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_tags_conversationId_tagId_key" ON "chat_tags"("conversationId", "tagId");

-- CreateIndex
CREATE INDEX "wa_notes_contactId_created_at_idx" ON "wa_notes"("contactId", "created_at");

-- CreateIndex
CREATE INDEX "wa_appointments_contactId_scheduled_at_idx" ON "wa_appointments"("contactId", "scheduled_at");

-- CreateIndex
CREATE INDEX "wa_appointments_assignedToId_scheduled_at_idx" ON "wa_appointments"("assignedToId", "scheduled_at");

-- CreateIndex
CREATE INDEX "wa_appointments_status_scheduled_at_reminded_at_idx" ON "wa_appointments"("status", "scheduled_at", "reminded_at");

-- CreateIndex
CREATE INDEX "wa_account_routing_rules_waAccountId_order_idx" ON "wa_account_routing_rules"("waAccountId", "order");

-- CreateIndex
CREATE INDEX "wa_sequences_waAccountId_triggerType_active_idx" ON "wa_sequences"("waAccountId", "triggerType", "active");

-- CreateIndex
CREATE INDEX "wa_sequences_channelAccountId_triggerType_active_idx" ON "wa_sequences"("channelAccountId", "triggerType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "wa_sequence_steps_sequenceId_order_key" ON "wa_sequence_steps"("sequenceId", "order");

-- CreateIndex
CREATE INDEX "wa_sequence_enrollments_status_next_run_at_idx" ON "wa_sequence_enrollments"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "wa_sequence_enrollments_sequenceId_contactId_key" ON "wa_sequence_enrollments"("sequenceId", "contactId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_created_at_idx" ON "notifications"("userId", "read", "created_at");

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_accounts" ADD CONSTRAINT "wa_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_definitions" ADD CONSTRAINT "contact_custom_field_definitions_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_definitions" ADD CONSTRAINT "contact_custom_field_definitions_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "contact_custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_account_shares" ADD CONSTRAINT "wa_account_shares_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_account_shares" ADD CONSTRAINT "wa_account_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_account_shares" ADD CONSTRAINT "channel_account_shares_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_account_shares" ADD CONSTRAINT "channel_account_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_chats" ADD CONSTRAINT "wa_chats_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_chats" ADD CONSTRAINT "wa_chats_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_chats" ADD CONSTRAINT "wa_chats_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_scorer_bots" ADD CONSTRAINT "wa_lead_scorer_bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_scorer_usage" ADD CONSTRAINT "wa_lead_scorer_usage_scorerId_fkey" FOREIGN KEY ("scorerId") REFERENCES "wa_lead_scorer_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_scores" ADD CONSTRAINT "wa_lead_scores_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_scores" ADD CONSTRAINT "wa_lead_scores_scorerId_fkey" FOREIGN KEY ("scorerId") REFERENCES "wa_lead_scorer_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wa_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_leadSheetSourceId_fkey" FOREIGN KEY ("leadSheetSourceId") REFERENCES "lead_sheet_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_recovery_attempts" ADD CONSTRAINT "wa_lead_recovery_attempts_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_lead_recovery_attempts" ADD CONSTRAINT "wa_lead_recovery_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "wa_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_templates" ADD CONSTRAINT "wa_templates_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sheet_sources" ADD CONSTRAINT "lead_sheet_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sheet_sources" ADD CONSTRAINT "lead_sheet_sources_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sheet_sources" ADD CONSTRAINT "lead_sheet_sources_waTemplateId_fkey" FOREIGN KEY ("waTemplateId") REFERENCES "wa_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sheet_imported_rows" ADD CONSTRAINT "lead_sheet_imported_rows_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "lead_sheet_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaigns" ADD CONSTRAINT "wa_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaigns" ADD CONSTRAINT "wa_campaigns_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaigns" ADD CONSTRAINT "wa_campaigns_waTemplateId_fkey" FOREIGN KEY ("waTemplateId") REFERENCES "wa_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaign_recipients" ADD CONSTRAINT "wa_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wa_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bots" ADD CONSTRAINT "wa_bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bots" ADD CONSTRAINT "wa_bots_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bots" ADD CONSTRAINT "wa_bots_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_conversations" ADD CONSTRAINT "wa_bot_conversations_botId_fkey" FOREIGN KEY ("botId") REFERENCES "wa_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_conversations" ADD CONSTRAINT "wa_bot_conversations_waChatId_fkey" FOREIGN KEY ("waChatId") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_conversations" ADD CONSTRAINT "wa_bot_conversations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_knowledge_bots" ADD CONSTRAINT "wa_bot_knowledge_bots_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "wa_bot_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_knowledge_bots" ADD CONSTRAINT "wa_bot_knowledge_bots_botId_fkey" FOREIGN KEY ("botId") REFERENCES "wa_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_bot_usage" ADD CONSTRAINT "wa_bot_usage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "wa_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_metaAdsAccountId_fkey" FOREIGN KEY ("metaAdsAccountId") REFERENCES "meta_ads_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads_accounts" ADD CONSTRAINT "meta_ads_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads_accounts" ADD CONSTRAINT "meta_ads_accounts_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_conversion_events" ADD CONSTRAINT "meta_conversion_events_metaAdsAccountId_fkey" FOREIGN KEY ("metaAdsAccountId") REFERENCES "meta_ads_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_tags" ADD CONSTRAINT "chat_tags_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_tags" ADD CONSTRAINT "chat_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_notes" ADD CONSTRAINT "wa_notes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_notes" ADD CONSTRAINT "wa_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_appointments" ADD CONSTRAINT "wa_appointments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_appointments" ADD CONSTRAINT "wa_appointments_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_appointments" ADD CONSTRAINT "wa_appointments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_account_routing_rules" ADD CONSTRAINT "wa_account_routing_rules_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_account_routing_rules" ADD CONSTRAINT "wa_account_routing_rules_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequences" ADD CONSTRAINT "wa_sequences_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequences" ADD CONSTRAINT "wa_sequences_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequences" ADD CONSTRAINT "wa_sequences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequence_steps" ADD CONSTRAINT "wa_sequence_steps_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "wa_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequence_enrollments" ADD CONSTRAINT "wa_sequence_enrollments_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "wa_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sequence_enrollments" ADD CONSTRAINT "wa_sequence_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

