# Base de datos y cifrado

> Detalle técnico movido desde `AGENTS.md` (2026-11-01). Las reglas esenciales siguen en [`AGENTS.md`](../../AGENTS.md) y [`CLAUDE.md`](../../CLAUDE.md); aquí está el detalle completo. Mantén este archivo al día en el mismo cambio que el código.

## Database

### Schema
`prisma/schema.prisma` — 72 models. Key relationships: `Organization → User[]` + every top-level entity (see "Architecture: tenancy"), `User → WAAccount[]`, `WABot ↔ WABotKnowledge (M:N via WABotKnowledgeBot)`, `WAAccount → WAAccountShare[] → User`, `WAChat → Contact (1:1)`, `Contact ↔ Tag (M:N via ContactTag)`, `User → WALeadScorerBot[]`, `WAChat → WALeadScore[] ← WALeadScorerBot` (one score per `(chatId, scorerId)` pair, see "Lead scoring" below), `WAChat → WALeadRecoveryAttempt[]` (see "Lead recovery" below). Generic channel tables parallel the WhatsApp ones: `ChannelAccount` (+ `ChannelAccountShare[]` → User, multi-canal equivalently scoped via `getUserAccountIds()`), `Conversation`, `ChannelMessage` (see "Canal genérico" below). Meta Ads tables: `MetaAdsAccount`, `MetaConversionEvent` (see "Meta Ads" below). `WAMessage` carries all media metadata: `messageType` (`text`/`image`/`audio`/`video`/`document`/`sticker`), `caption`, `mediaId` (Meta id), `mediaUrl` (relative path under `MEDIA_ROOT`), `mimeType`, `filename`, `bytesSize` (`width`/`height`/`duration` were dropped 2026-07 — Meta's webhook never populated them). `body` is reused for both text and caption-derived text; `caption` is the dedicated caption field.

### Migrations (`prisma migrate`, since 2026-09-16)
```bash
sh scripts/new-migration.sh <nombre>   # after editing schema.prisma: generates prisma/migrations/<ts>_<nombre>/migration.sql, applies it, regenerates the client
sh scripts/db-migrate.sh               # what dev boot and prod startup run: migrate deploy (+ adopts a legacy db-push database once) + pgvector index
```
- **Never `prisma db push` and never `prisma migrate dev`.** `db push --accept-data-loss` ran on every production start before 2026-09-16 and would silently DROP columns with data on any rename (audit `docs/AUDIT_2026-09-16.md` → C2). `migrate dev` detects the IVFFlat index (created outside Prisma, see pgvector below) as drift and offers to **reset the database**; `scripts/new-migration.sh` avoids it by diffing the migrations (applied to a throwaway `<db>_shadow`) against the schema instead of looking at the real DB.
- `prisma/migrations/0_init` is the baseline generated from `main` @ `273c0bb` (production's schema at the switch). `scripts/db-migrate.sh` handles 3 states: managed (`_prisma_migrations` exists) → `migrate deploy`; empty → `migrate deploy`; **legacy db-push DB** → non-destructive `db push` to the frozen `prisma/baseline/schema.prisma`, `migrate resolve --applied 0_init`, then `migrate deploy`. If adopting would lose data, `db push` aborts and startup fails instead of dropping anything (verified with an extra column holding data). Don't edit `prisma/baseline/` or `0_init`.
- Data fixes go in migrations too (e.g. `20260916000000_normalize_user_emails`). Review every generated `migration.sql` before committing — renames come out as DROP + ADD and must be rewritten as `ALTER ... RENAME`.
- Back up the production database before deploying a migration (Coolify scheduled backup or `pg_dump`) — `migrate deploy` doesn't roll back a half-applied data migration.

### pgvector
PostgreSQL image is `pgvector/pgvector:pg16`. Extension enabled by the `db-init` service in `docker-compose.yml` (`docker/init.sql` is no longer mounted: under Coolify a bind mount of a repo file becomes a directory and Postgres fails to start). Vector column is `vector(768)` — **all embeddings are Google's** (`gemini-embedding-2`, truncated to 768 via `outputDimensionality`), since OpenCode Go has no embeddings endpoint (see "AI providers" → embeddings fallback).

**IVFFlat index gotcha**: `docker/init.sql` only runs once, at Postgres's *first* volume init — before the migrations have created `wa_bot_knowledge`, so a `CREATE INDEX` there fails silently (table doesn't exist yet) and never gets a second chance. The index is instead created by `prisma/sql/ensure-vector-index.sql`, run via `npx prisma db execute --file ... ` *after* `migrate deploy` in `scripts/db-migrate.sh` (run by both prod startup and the dev command). `prisma/sql/ensure-search-indexes.sql` (same mechanism) also holds the chat-list order indexes `idx_wa_chats_account_last_message_desc` / `idx_conversations_account_last_message_desc` (`(account, "lastMessageAt" DESC NULLS LAST)`, which Prisma can't declare): the inbox orders by that and the Prisma index is ASC. If RAG search feels like it's doing a full table scan, check `SELECT indexname FROM pg_indexes WHERE tablename = 'wa_bot_knowledge'` for `idx_knowledge_embedding` before assuming it's a query problem.

### Triggers

There is exactly one, on purpose: `contacts_stage_entered_at` (migration `20261111205239_contact_stage_entered_at`) keeps `contacts.stage_entered_at` in sync whenever `leadStatus` or `pipeline_stage_id` changes, because stage changes come from too many writers (UI, API, bots, automations, scorer) to stamp by hand. Prisma doesn't know it exists — don't remove it from a regenerated migration, and don't write `stageEnteredAt` from code.

### Raw SQL gotcha
Prisma `$queryRawUnsafe` uses actual DB column names. Fields without `@map` use the Prisma field name as-is (camelCase). Prefer Prisma query builder over raw SQL.

### Registration
`POST /api/auth/register` is always open (SaaS signup): body `{name, email, password, businessName}`, rate-limited per IP (5/min) and globally (300/h). It creates the organization (`TRIALING`, plan `PRO`, `trialEndsAt` = now + `TRIAL_DAYS`) and its admin owner inside a `Serializable` transaction; a duplicate email or a serialization conflict (`P2002`/`P2034`) answers 409. The old `/onboarding` first-admin flow and `SystemConfig` (`allowRegistration`, global `businessName`) were removed — the business name shown in the shell is `Organization.name`.

## Encryption

AES-256-GCM with random 12-byte IV + 16-byte auth tag. Format: `hex(iv):hex(authTag):hex(ciphertext)`. Key from `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes generated via `openssl rand -hex 32`).

Fields encrypted at rest: `WAAccount.accessToken`, `WAAccount.appSecret`, `ChannelAccount.credentials`, `MetaAdsAccount` tokens, webhook secrets. The 11 secret fields of `PlatformSettings` (AI keys, Stripe, SMTP, Turnstile, Meta CAPI, the platform Meta app's App Secret and webhook verify token, the backup bucket's access keys) are encrypted the same way. (Per-user AI keys no longer exist: the platform keys live in `PlatformSettings`, see "Platform business configuration".)
