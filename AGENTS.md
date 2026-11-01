# AGENTS.md

Essential rules for working on Colibly. This file is loaded into every agent session, so it only holds what prevents bugs: invariants, scoping rules, traps. **The full detail of each module lives in `docs/arquitectura/`** (moved there verbatim on 2026-11-01 — the old single file was 173 K characters). Read the matching doc before touching a module, and update it in the same change as the code. Keep this file under ~30 K characters: new detail goes to `docs/arquitectura/`, only a new *rule* comes here.

## Map of the detail

| Doc | Covers |
|---|---|
| [`desarrollo.md`](docs/arquitectura/desarrollo.md) | compose files, prod env passthrough list, `media_data` volume, Coolify ports |
| [`marca-y-sitio.md`](docs/arquitectura/marca-y-sitio.md) | brand/rename history, public site, measurement + consent, CSP, Turnstile, landing chat, SEO, legal drafts, onboarding checklist |
| [`tenencia-y-roles.md`](docs/arquitectura/tenencia-y-roles.md) | `Organization`, scoping helpers, isolation sweep, the 3 roles and blocked routes, account sharing |
| [`billing.md`](docs/arquitectura/billing.md) | plans/seats, `state.ts`, gates, Stripe (checkout, plan change, webhook), billing tick + purge, plan UI, export/delete |
| [`plataforma.md`](docs/arquitectura/plataforma.md) | `/plataforma`, `PlatformSettings`, backups, platform API tokens, OAuth + MCP, doctor |
| [`frontend.md`](docs/arquitectura/frontend.md) | Next 16 quirks, RSC pages + `_view.tsx`, design tokens, themes, workbench/`EntityList`, modal pattern |
| [`base-de-datos.md`](docs/arquitectura/base-de-datos.md) | schema overview, migrations workflow, pgvector index, raw SQL, registration, encryption |
| [`colas.md`](docs/arquitectura/colas.md) | the 24 BullMQ queues, humanized bot replies, bot reply rules (debounce, takeover, retries) |
| [`ia.md`](docs/arquitectura/ia.md) | providers, curated/operator-picked models, credits, multimodal, embeddings, pricing, prompt wrapping |
| [`whatsapp.md`](docs/arquitectura/whatsapp.md) | template creation, Cloud API, multiple Meta apps, Calling API, webhook, media, Embedded Signup + coexistence |
| [`canales.md`](docs/arquitectura/canales.md) | Telegram / Messenger / Instagram / web widget stack, comment-to-inbox, webchat security model |
| [`integraciones.md`](docs/arquitectura/integraciones.md) | domain events, public API `/api/v1`, outgoing webhooks, SSRF, automations engine, Meta Ads CAPI |
| [`crm.md`](docs/arquitectura/crm.md) | contacts, assignment, notifications, campaigns → CRM, lead scoring, lead recovery, appointments, custom fields, sequences, pipelines, tasks |
| [`bandeja.md`](docs/arquitectura/bandeja.md) | chat status, tags, canned responses, auto-assign, agent metrics, snooze/priority/bulk/typing/drafts, timeline, reports, command palette, import, CSAT, macros, conversation attributes |
| [`auth.md`](docs/arquitectura/auth.md) | NextAuth setup, verification/reset/invite emails, session revalidation |
| [`gotchas.md`](docs/arquitectura/gotchas.md) | the complete list of known traps (the short version is at the end of this file) |

Plans, audits and launch status: [`docs/README.md`](docs/README.md).

## Stack
- **Next.js 16** (App Router, Turbopack) + **Tailwind CSS v4** (CSS-based, `@theme inline`)
- **NextAuth v5** beta (Credentials + JWT only, no adapter)
- **Prisma 5** (PostgreSQL 16 + pgvector)
- **Redis 7** + **BullMQ** (job queues)
- React 19, lucide-react, zod, bcryptjs, next-themes, openai, @google/generative-ai, ioredis, recharts, @dnd-kit/core
- Channels: WhatsApp Cloud API (multimodal in/out), Telegram, Messenger/Instagram (page-linked Graph API), own web widget.

## Development

Commands and host details are in `CLAUDE.md` → "Commands" (Docker on `ludaisca`). Rules:
- `docker-compose.yml` is production (Coolify); `docker-compose.override.yml` adds dev. **Production env is an explicit passthrough list** (`app.environment`): a new *infrastructure* env var goes there and in `.env.example`; a new *business* setting goes to `PlatformSettings`, never an env var. SMTP, Stripe, AI keys, Turnstile and measurement ids are `PlatformSettings` rows.
- Never add a fixed `ports:` mapping to `docker-compose.yml` (redeploys fail with "port is already allocated").
- `tailwindcss`/`@tailwindcss/postcss` stay in `dependencies`; `public/.gitkeep` must exist.
- `node_modules` belongs to the container: install packages with `docker compose exec app npm install <pkg>`.

## Tenancy (detail: `tenencia-y-roles.md`)

- The workspace is an `Organization`; every `User` belongs to exactly one, and `User.role` is the role inside it.
- `organizationId` lives on **top-level entities only** (`User`, `WAAccount`, `ChannelAccount`, `WABot`, `WALeadScorerBot`, `MetaAdsAccount`, `ApiKey`, `WebhookEndpoint`, `Automation`, `WASequence`, `WACampaign`, `LeadSheetSource`, `Macro`, `Pipeline`…). Everything else hangs off an account. A new top-level model needs `organizationId`, set with `requireOrgId(userId)` on create, and a `onDelete: Cascade` chain from `Organization`.
- Helpers (`lib/tenancy.ts`, `lib/shared-accounts.ts`): `orgWhere(userId)` for admin resources, `accountManageWhere(userId)` for editing/deleting/sharing an account, `getUserAccountIds()` / `getUserChannelAccountIds()` for anything reached through an account (admins get every account of their org; `user`/`ejecutivo` get own + shared).
- **Never scope by creator** (`userId: session.user.id`) for anything the organization shares. This bug shipped repeatedly (template sync/create, campaign create, channel chats). Per-user rows that stay per-user: `GoogleAccount`, `Notification`.
- Shares (`WAAccountShare`, `ChannelAccountShare`) only accept a target in the same organization.
- `tsc` can't see a missing scope: test a new route with a second organization (signup creates one) and expect 404/403 on foreign ids.

## Billing (detail: `billing.md`)

- `lib/billing/plans.ts` is the only place for prices/limits (Básico 59 / Avanzado 89 / Pro 149 MXN per user per month; enum ids `ESSENTIAL`/`BUSINESS`/`PRO`). 14-day trial on PRO without a card (`TRIAL_DAYS`).
- Rules are pure, unit-tested functions in `lib/billing/state.ts` (`accessMode`, `planLimits`, `tickTransition`, `deriveFromSubscription`, `planChangeImpact`…). Keep them pure: async lookups are resolved before calling them.
- **Read-only blocks writes, not reads.** `proxy.ts` answers 402 to non-GET `/api` requests of a non-`full` org (small allowlist). **Every low-level sender calls `assertOrgCanSend()`**; a new way to send must go through one of them. **Every worker/tick skips non-writable orgs** (`isOrgWritable`/`isAccountWritable`/`isBotWritable`) *before* spending AI. Inbound messages are always stored.
- **Limits are checked where the resource is created** (`checkPlanLimit()` / `evaluatePlanLimit()`; boolean features via `checkCampaignsAccess`, `checkBotsAccess`, `checkLeadScoringAccess`, `checkAiAccess`, `checkWebchatAccess`). Every 402 carries `code: "read_only"` or `"plan_limit"`. Per-seat limits resolve against `channelSeatBase()`.
- Stripe config is `PlatformSettings` (never env). The webhook re-reads the subscription (`syncSubscription()`) so event order doesn't matter. `planPriceError()` refuses checkout if the Stripe price doesn't match `plans.ts`.
- Deleting an organization = `lib/org-data/delete.ts:deleteOrganizationData()` (owner delete + 60-day purge): cancel Stripe first, then one cascading delete plus what cascade can't reach (RAG chunks, media folders). Add any non-cascading data there.

## Platform operator (detail: `plataforma.md`)

- `/plataforma` access is `PLATFORM_ADMIN_EMAILS` (env, deliberately not in the DB) — not a role. Checked in `plataforma/layout.tsx` and every `/api/plataforma` handler (`requirePlatformAdmin()`, 404 otherwise).
- `lib/platform-settings.ts:getPlatformSettings()` is the single read path for `PlatformSettings` (30 s cache, decrypts the secret fields). `GET` endpoints never return a secret, only `has<Field>`; reveal is an explicit, rate-limited, logged action. Logs record field names, never values.
- `lib/platform/` is the shared business layer for the session API, the token API and the MCP tools — don't duplicate logic in a route. No tool reveals a secret, deletes an organization or refunds.
- Env-only on purpose: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `APP_URL`, `PLATFORM_ADMIN_EMAILS`. `ENCRYPTION_KEY` is not in the backups — keep it off the server.

## Roles (detail: `tenencia-y-roles.md`)

Exactly three roles — don't add/remove any without asking: `admin` (everything), `user` (no Contactos, Bots IA, Meta Ads, Usuarios, AI/API config), `ejecutivo` (Chats, Contactos, Citas, Config only).
- Defense in depth, always: **hide the nav item → block the route in `proxy.ts` (`USER_BLOCKED` / `EXECUTIVE_BLOCKED`) → 403 in the API with `lib/roles.ts:forbidRoles(session, [...])`** right after the session check. The role lists in `proxy.ts` never apply to `/api`, so every mutating API route of a restricted section must repeat the check.
- Every new top-level page section must be in `PROTECTED` in `proxy.ts`, or the role checks are skipped entirely.
- The organization owner can never be demoted or disabled; each org keeps at least one active admin.
- AI config is admin-only in 3 layers; `GET /api/configuracion/ia/models` stays open (bot/scorer forms need it).

## AI (detail: `ia.md`)

- AI is provided by the platform: one key per provider (OpenCode Go, Google) in `PlatformSettings`, read via `getPlatformApiKey()`. No per-user keys. Customers don't pick models; the operator does (`aiTextModel`/`aiVisionModel`), resolved by `resolvePlatformModel()`.
- **A new AI call** checks the platform key, then `reserveAiCredit(organizationId)`, then calls the provider, then records usage (and extends `getOrgAiCost()` if it's a new usage table). Out of credits: bots stay silent, manual actions answer 402 `ai_credits`.
- Embeddings are always Google (`gemini-embedding-2`, 768 dims) even when replies use OpenCode. Audio input is Gemini-only.
- User system prompts go through `wrapUserPrompt()`; flows that talk to end users append `SCOPE_GUARDRAIL`.
- Google SDK: `systemInstruction` goes to `getGenerativeModel()` as a plain string, never to `startChat()`.

## Channels (detail: `whatsapp.md`, `canales.md`)

Two parallel stacks (adapter layer, not a migration — the `WA*` tables hold production data): WhatsApp (`WAAccount`/`WAChat`/`WAMessage`) and generic channels (`ChannelAccount`/`Conversation`/`ChannelMessage` for Telegram, Messenger, Instagram, WEBCHAT). The shared pieces and cross-channel traps are in `CLAUDE.md` → "Architecture: two parallel channel stacks". Rules:
- Outbound WhatsApp goes through `lib/whatsapp/send.ts:sendWhatsAppMessage()`; API/automation/macro sends through `lib/messaging/outbound.ts:sendOutbound()` (enforces the 24 h window, persists, emits `message.sent`).
- Every `WAAccount` is self-contained (its own Meta app credentials); never assume a global Meta app for `MANUAL` accounts. `EMBEDDED_SIGNUP` accounts use the platform app and have `appSecret = null` by design (`hasAppSecret` is derived) — never validate their webhook with an account secret or vice versa.
- Webhooks validate `X-Hub-Signature-256` and drop the payload on mismatch. Coexistence ingestion is silent (no notifications, bot, automations or unread counts); a business-app echo counts as human takeover. Mexican numbers: look chats/contacts up with `jidCandidates()` (52… / 521…).
- Media is stored on disk under `MEDIA_ROOT` (relative paths) and **always served through the authenticated proxy** (`/api/whatsapp/messages/[id]/media` etc.) — never expose Meta URLs. Client code imports `media-shared.ts`, never `media-store.ts`.
- Channel scoping always via `getUserChannelAccountIds()`, never `channelAccount: { userId }`. Generic channels deliberately lack campaigns/templates, lead scoring and chat tags (guarded in the UI).
- Web widget: we are the provider. The server assigns `visitorId`; the widget never renders its own message optimistically.

## Events, API, webhooks, automations (detail: `integraciones.md`)

- **Code that changes a domain fact must emit its event** (`emitDomainEvent()`, never throws): `message.received/sent`, `contact.created`, `contact.lead_status_changed`, `tag.added`, `conversation.assigned/resolved`, `appointment.*`, `lead.scored`, `lead.ad_captured`. For lead status and contact tags call `afterLeadStatusChanged()` / `afterContactTagAdded()` instead of repeating side effects inline. A new `contact.created` source needs the union in `lib/events/types.ts` **and** the enum in `lib/api/openapi.ts`.
- Public API `/api/v1/*`: `withApiErrors` + `authenticateApiKey(req, scope)`; ids outside the scope answer **404, never 403**; update `lib/api/openapi.ts` in the same change as any route.
- Any HTTP request to a user-supplied URL goes through `lib/net/safe-fetch.ts`.
- Automations: the graph is a tree; adding a step type = `types.ts` + `validate.ts` + `executor.ts` + `labels.ts` + editor form + tests. **Both ingests call `dispatchInboundMessage()` before enqueuing the bot** and skip it on `suppressBot` — a new inbound path must do the same. Don't add features to the legacy `WASequence`.
- Meta CAPI (`lib/meta/conversions.ts`) refuses to send unless TEST mode with `testEventCode` or `mode: LIVE` is explicit.

## CRM and inbox (detail: `crm.md`, `bandeja.md`)

- `Contact` is shared by both stacks (`accountId` XOR `channelAccountId`): scope contact queries with both. A name never regresses to a phone-number fallback (`isFallbackName()`).
- Assignment candidates come from `lib/chat-assignees.ts` (`getEligibleAssignees` / `getEligibleChannelAssignees`); never trust a client-sent `assignedToId` or `tagId` without that check / `tagBelongsTo()`. Tags are per account.
- Automatic assignment also passes candidates through `lib/users/availability.ts:assignableCandidateIds()` (the account's "solo en línea" switch); a new auto-assign path must do the same.
- `WALeadScore` is keyed by `(chatId, scorerId)`; scoring logic lives only in `scoreChatWithScorer()`. Scheduled scoring stays Telegram-only on the channel side.
- **`leadRecoveryEnabled` sends real messages unattended** every 15 min — never enable it (or shrink its thresholds) in a DB pointing at real accounts without the user's explicit OK.
- Pipelines: `lib/pipeline/stages.ts:leadStatusForStage()` is the only status↔stage mapping; outcome changes write `LeadOutcomeEvent`. Don't compute funnels from `leadStatus` alone.
- Chat list filters live in `lib/chats/query.ts` (shared by both chat tables) — add new filters there. Callers must validate `accountId` against the user's accounts before passing it in.
- Snooze is a field (`snoozedUntil`), not a `ChatStatus`; ingest clears it on any inbound. Saved views and drafts are per-browser `localStorage`.
- **"Esperando respuesta" is `waitingSince`** on `WAChat`/`Conversation` (`lib/chats/waiting.ts`): both ingests call `markWaiting()`; a reply from a person, the bot or a conversational flow clears it (`markReplied()` or `waitingSince: null` in the same update), and so does resolving. Automatic notices (away message, auto-resolve, CSAT, campaigns, recovery) must **not** clear it — `sendOutbound(..., { countsAsReply: false })`. A new path that answers a customer must clear it; `lib/chats/__tests__/waiting.test.ts` guards the existing call sites.
- `/whatsapp/chat`'s rail keeps its own dense structure — confirm with the user before restructuring it.
- No websockets anywhere: polling is the pattern for anything live.
- A bell `Notification` that should also reach the browser calls `lib/notifications/push.ts:queuePush()` right after creating it (today: chat message, chat assigned, incoming call). Logging out must call `disablePush()`.

## Database (detail: `base-de-datos.md`)

- Schema changes: `sh scripts/new-migration.sh <nombre>`. **Never `prisma db push`, never `prisma migrate dev`** (it sees the IVFFlat index as drift and offers to reset the DB). Review every generated `migration.sql`: renames come out as DROP + ADD and must be rewritten as `ALTER … RENAME`. Data fixes go in migrations. Don't edit `prisma/baseline/` or `0_init`.
- After a migration, restart the app container (the running process keeps the old Prisma Client).
- The pgvector index is created by `prisma/sql/ensure-vector-index.sql` after `migrate deploy` — don't add it to `docker/init.sql`.
- Raw SQL uses real column names (`@map`); prefer the query builder.
- Encrypted at rest with `lib/crypto.ts` (AES-256-GCM): account tokens/secrets, `ChannelAccount.credentials`, Meta Ads tokens, webhook secrets, the secret `PlatformSettings` fields.

## Queues (detail: `colas.md`)

- Workers live in `lib/workers/`, queues in `lib/queue.ts`, started by `instrumentation.ts`. There are no per-job timeouts in BullMQ 5: the time limit is on each outbound HTTP call (`lib/http-timeouts.ts`).
- Ticks process bounded batches and must be idempotent (atomic `updateMany` claims, one-shot stamps).
- Knowledge indexing is always `ragQueue.add()`, never `indexDocument()` inside a request.
- Bots: one active bot per account; replies are debounced (4 s) and paused 30 min after a human reply; once a reply is delivered, later errors are logged, not rethrown (no duplicate sends on retry).
- Use `getRedisClient()` (singleton), and `rateLimit()` on any new auth-sensitive or public endpoint.

## Auth (detail: `auth.md`)

- Server: `await auth()`; client: `useSession()`. JWT only, revalidated every 60 s (role changes, disabled users and `sessionVersion` bumps apply within a minute).
- One-time links live in `AuthToken` (only the sha256 is stored, consumption is atomic). Emails are sent inside `after()`.
- Unverified emails can't sign in (except `PLATFORM_ADMIN_EMAILS`); channel-account creation requires `requireVerifiedEmail()`.
- Signup always creates a new organization; members are added by invitation or by an admin.

## Framework quirks (detail: `frontend.md`)

- `proxy.ts` IS the middleware (Next 16), not `middleware.ts`.
- `params`/`searchParams` in pages and route handlers are `Promise<>` — `await` them.
- Server Components can't pass functions (Lucide icons, `render` callbacks, `<Button icon={…}>`) to Client Components: split into `page.tsx` (RSC, data) + `_view.tsx` (`"use client"`), or a small client wrapper.
- Pages using `useSearchParams()` must be wrapped in `<Suspense>`.
- After adding/removing routes, clear the `next_cache` volume (stop app, empty the volume, start app) — a stale Turbopack cache causes 404/500s or an infinite reload loop. The exact command is in `frontend.md`.
- `Modal` initializes `visible` from `open` — auto-open-via-URL modals depend on it.
- Never use Tailwind `dark:` (it follows the OS, not the app toggle); use semantic tokens.
- RSC pages get a sibling `loading.tsx` with a skeleton that mirrors the page.

## Design system (detail: `frontend.md`)

- Colors only through semantic tokens (`bg-surface`, `text-foreground`, `text-muted`, `text-accent-ink`, `bg-accent` + `text-on-accent`, `border-accent-strong`, `bg-accent-subtle`…). **Never Tailwind color literals, never `text-accent`, never opacity modifiers on the accent.** Hex copies for emails/images live in `lib/brand-colors.ts` — change both together. Add new token pairs to `lib/design/__tests__/contrast.test.ts`. There must be exactly one `.dark {` block in `globals.css`.
- Never write inline button/card/input classes; use the components in `app/components/ui/`. Forms: `<FormField label error>{(id) => <Input id={id}/>}</FormField>`. Toasts: `useToast()`. Selects: `select.tsx` / `multi-select.tsx` / `searchable-select.tsx` — don't build a fourth.
- Lists use `EntityList`/`EntityRow`; overview pages use `PageHeader` → `KpiStrip` → `Workbench` + `SectionHeader`; dense numeric reports use `<Table>`. CRUD is a `_form.tsx` modal next to the list (`whatsapp/plantillas/_form.tsx` is the reference). A page root with `max-w-*` must also have `mx-auto`.
- Per-entity hue only via `hueClassFor(id)` / `HUE_CLASS[hueIndex(id)]`, keyed by `accountId` for WhatsApp-scoped things. Don't add new `rounded-bubble` usages.
- Brand text through `lib/brand.ts`; the logo is `BrandMark`.

## Gotchas (full list: `gotchas.md`)

- **`where.OR` for account scoping gets overwritten by a search `OR`** — combine under `AND`.
- **Telegram `message_id` is unique per chat, not per bot** — dedupe inbound by conversation.
- **Campaign visibility is per account, not per creator**; GETs shared with the inbox stay open on purpose.
- **Role guards live in the APIs too**: bots APIs 403 for non-admin, `GET /api/whatsapp/contacts` 403s for `user` (the `[id]` detail stays open for the drawer), `/api/usuarios` is org-scoped and admin-only.
- **`npm run build` in the dev container fails** (`NODE_ENV=development`) — use the isolated `builder` image build from `CLAUDE.md`.
- **Worker code doesn't hot-reload** — restart the app after editing anything a worker runs (`lib/workers/**`, `lib/bots/**`, `lib/sequences.ts`, ingest code run in jobs).
- **`docker compose restart` doesn't re-read `.env`** — use `docker compose up -d app`.
- **`WABot.status` and `isActive` are separate gates**; an error sets `status: ERROR` and only the toggle resets it. `/test` bypasses both.
- **`/api/whatsapp/chats` has two response shapes** (flat array without `page`, paginated object with it).
- **`pdf-parse` must be imported as `pdf-parse/lib/pdf-parse.js`.**
- **Never put `<Button>` inside `<Link>`**; use `router.push` or a styled `<a>`.
- Embeddings are 768-dim; RAG chunk ids use `crypto.randomUUID()`; campaigns must check the template is `APPROVED`; templates need `wabaId`.
- Client catch blocks use `toastError()`, never an empty `{}`. `cn()` is a plain join (no tailwind-merge).
- Rate-limit keys persist in Redis (`ratelimit:*`): when e2e runs trip them in dev, delete those keys.
- `MEDIA_RETENTION_DAYS` (default 90) drives the daily media purge; `<= 0` disables it.
- Browser verification: check which Playwright MCP namespace is available before assuming it works (`mcp__playwright__*` has worked; the `plugin_` one needs a Chrome install).
