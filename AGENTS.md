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
| [`colas.md`](docs/arquitectura/colas.md) | the 26 BullMQ queues (own `worker` service in production), humanized bot replies, bot reply rules (debounce, takeover, retries) |
| [`ia.md`](docs/arquitectura/ia.md) | providers, curated/operator-picked models, credits, multimodal, embeddings, pricing, prompt wrapping |
| [`whatsapp.md`](docs/arquitectura/whatsapp.md) | template creation, Cloud API, multiple Meta apps, Calling API, webhook, media, Embedded Signup + coexistence |
| [`canales.md`](docs/arquitectura/canales.md) | Telegram / Messenger / Instagram / web widget stack, comment-to-inbox, webchat security model |
| [`integraciones.md`](docs/arquitectura/integraciones.md) | domain events, public API `/api/v1`, customer MCP `/api/v1/mcp`, outgoing webhooks, SSRF, automations engine, Meta Ads CAPI |
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
- React 19, lucide-react, zod, bcryptjs, openai, @google/generative-ai, ioredis, recharts, @dnd-kit/core
- Channels: WhatsApp Cloud API (multimodal in/out), Telegram, Messenger/Instagram (page-linked Graph API), own web widget.

## Development

Commands and host details are in `CLAUDE.md` → "Commands" (Docker on `ludaisca`). Rules:
- `docker-compose.yml` is production (Coolify); `docker-compose.override.yml` adds dev. **Production env is an explicit passthrough list** (`app.environment`): a new *infrastructure* env var goes there and in `.env.example`; a new *business* setting goes to `PlatformSettings`, never an env var. SMTP, Stripe, AI keys, Turnstile and measurement ids are `PlatformSettings` rows.
- Never add a fixed `ports:` mapping to `docker-compose.yml` (redeploys fail with "port is already allocated").
- **Dev ports follow the server convention** (`CLAUDE.md` → "The dev server is on port 1100"; table in `desarrollo.md`): Colibly owns 1000-1999 (app 1100, Mailpit 1101, bench 12xx, previews 19xx) and Tailscale Serve 10000-10999. Publish on `127.0.0.1`, remote access only through `tailscale serve`; never pick a port outside the block.
- `tailwindcss`/`@tailwindcss/postcss` stay in `dependencies`; `public/.gitkeep` must exist.
- `node_modules` belongs to the container: install packages with `docker compose exec app npm install <pkg>`.

## Tenancy (detail: `tenencia-y-roles.md`)

- The workspace is an `Organization`; every `User` belongs to exactly one, and `User.role` is the role inside it.
- `organizationId` lives on **top-level entities only** (`User`, `WAAccount`, `ChannelAccount`, `WABot`, `WALeadScorerBot`, `MetaAdsAccount`, `ApiKey`, `WebhookEndpoint`, `Automation`, `WASequence`, `WACampaign`, `LeadSheetSource`, `Macro`, `Pipeline`, `Team`…). Everything else hangs off an account. A new top-level model needs `organizationId`, set with `requireOrgId(userId)` on create, and a `onDelete: Cascade` chain from `Organization`.
- Helpers (`lib/tenancy.ts`, `lib/shared-accounts.ts`): `orgWhere(userId)` for admin resources, `accountManageWhere(userId)` for editing/deleting/sharing an account, `getUserAccountIds()` / `getUserChannelAccountIds()` for anything reached through an account (admins get every account of their org; `user`/`ejecutivo` get own + shared). Both are cached 10 s per process: **anything that creates/deletes an account or a share must call `invalidateAccountScopes()`**.
- **Contacts are scoped through `lib/contacts/scope.ts:contactScopeWhere(userId)`** (adds the admin's channel-less contacts) and counted with `orgContactsWhere(orgId)` (excludes `isSample`); never hand-build the account `OR` for contacts. A channel-less contact (`accountId` and `channelAccountId` null, `organizationId` set) fires no outward effect (events, webhooks, sequences, Meta Ads) — `crm.md`.
- **Never scope by creator** (`userId: session.user.id`) for anything the organization shares. This bug shipped repeatedly (template sync/create, campaign create, channel chats). Per-user rows that stay per-user: `GoogleAccount`, `Notification`.
- Shares (`WAAccountShare`, `ChannelAccountShare`) only accept a target in the same organization.
- `tsc` can't see a missing scope: test a new route with a second organization (signup creates one) and expect 404/403 on foreign ids.

## Billing (detail: `billing.md`)

- `lib/billing/plans.ts` is the only place for prices/limits (Básico 59 / Avanzado 89 / Pro 149 MXN per user per month; enum ids `ESSENTIAL`/`BUSINESS`/`PRO`). 14-day trial on PRO without a card (`TRIAL_DAYS`).
- Rules are pure, unit-tested functions in `lib/billing/state.ts` (`accessMode`, `planLimits`, `tickTransition`, `deriveFromSubscription`, `planChangeImpact`…). Keep them pure: async lookups are resolved before calling them.
- **Read-only blocks writes, not reads.** `proxy.ts` answers 402 to non-GET `/api` requests of a non-`full` org (small allowlist). **Every low-level sender calls `assertOrgCanSend()`**; a new way to send must go through one of them. **Every worker/tick skips non-writable orgs** (`isOrgWritable`/`isAccountWritable`/`isBotWritable`) *before* spending AI. Inbound messages are always stored.
- **Limits are checked where the resource is created** (`checkPlanLimit()` / `evaluatePlanLimit()`; boolean features via `lib/billing/entitlements.ts` — person / channel owner / integration owner — plus `checkWebchatAccess`). Every 402 carries `code: "read_only"` or `"plan_limit"`. Per-seat limits resolve against `channelSeatBase()`.
- Stripe config is `PlatformSettings` (never env). The webhook re-reads the subscription (`syncSubscription()`) so event order doesn't matter. `planPriceError()` refuses checkout if the Stripe price doesn't match `plans.ts`.
- **Per-user licenses** (`docs/PLAN_LICENCIAS_2026-11-04.md`, `billing.md` → "Per-user licenses"): a new way to connect a channel calls `claimChannelOwner()` after creating it; a new way to add a person sets `User.license` and checks `license-billing.ts:checkLicenseAvailable()` first. **Feature gates go through `lib/billing/entitlements.ts`, never the org plan**: what a person asks for → `checkUserFeature`; anything automatic on a chat (worker, tick, ingest) → `channelHasFeature` (the channel owner's license); API keys/webhooks/Meta Ads → `integrationOwnerHas`. **A new AI call reserves with `reserveAiCredit({ userId })` or `({ channel })`** following the same rule. Orgs with `legacyUntil` keep the old catalog automatically through these helpers.
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
- **What a person asks for** (test a bot, simulate an automation, writing assist) reserves with `reservePersonAiCredit()`: in a channel-less trial it draws from the organization's `TRIAL_AI_TEST_CREDITS` bag (`billing.md`). Workers and anything automatic keep `reserveAiCredit`.
- **A new AI call** checks the platform key, then `reserveAiCredit(payer)` (the person who asked, or the channel owner for anything automatic), then calls the provider, then records usage (and extends `getOrgAiCost()` if it's a new usage table). Out of credits: bots stay silent, manual actions answer 402 `ai_credits`.
- Embeddings are always Google (`gemini-embedding-2`, 768 dims) even when replies use OpenCode. Voice notes are transcribed first (`lib/ai/transcribe.ts`: OpenCode `OPENCODE_AUDIO_MODEL` with `disableThinking`, Gemini as fallback) and bots answer the transcript with their text model — never read OpenCode's `reasoning_content` as an answer.
- User system prompts go through `wrapUserPrompt()`; flows that talk to end users append `SCOPE_GUARDRAIL`.
- Google SDK: `systemInstruction` goes to `getGenerativeModel()` as a plain string, never to `startChat()`.

## Channels (detail: `whatsapp.md`, `canales.md`)

Two parallel stacks (adapter layer, not a migration — the `WA*` tables hold production data): WhatsApp (`WAAccount`/`WAChat`/`WAMessage`) and generic channels (`ChannelAccount`/`Conversation`/`ChannelMessage` for Telegram, Messenger, Instagram, WEBCHAT). The shared pieces and cross-channel traps are in `CLAUDE.md` → "Architecture: two parallel channel stacks". Rules:
- Outbound WhatsApp goes through `lib/whatsapp/send.ts:sendWhatsAppMessage()`; API/automation/macro sends through `lib/messaging/outbound.ts:sendOutbound()` (enforces the 24 h window, persists, emits `message.sent`).
- Graph API version only through `lib/meta/graph.ts` (`GRAPH_API_VERSION` / `GRAPH_API_BASE` / `graphUrl()`) — never a hardcoded `vNN.0`.
- Every `WAAccount` is self-contained (its own Meta app credentials); never assume a global Meta app for `MANUAL` accounts. `EMBEDDED_SIGNUP` accounts use the platform app and have `appSecret = null` by design (`hasAppSecret` is derived) — never validate their webhook with an account secret or vice versa.
- Webhooks validate `X-Hub-Signature-256` and drop the payload on mismatch. Coexistence ingestion is silent (no notifications, bot, automations or unread counts); a business-app echo counts as human takeover. Mexican numbers: look chats/contacts up with `jidCandidates()` (52… / 521…).
- Media is stored on disk under `MEDIA_ROOT` (relative paths) and **always served through the authenticated proxy** (`/api/whatsapp/messages/[id]/media` etc.) — never expose Meta URLs. Client code imports `media-shared.ts`, never `media-store.ts`.
- Messenger/Instagram: every send goes through `lib/meta-messaging/comment-reply.ts` (Meta's comment rules + PSID alias); platform-connected accounts (`credentials.connection = "platform"`, no `appSecret`) are signed with the platform secret, never the reverse — `canales.md`.
- Channel scoping always via `getUserChannelAccountIds()`, never `channelAccount: { userId }`. Generic channels deliberately lack campaigns/templates, lead scoring and chat tags (guarded in the UI).
- Web widget: we are the provider. The server assigns `visitorId`; the widget never renders its own message optimistically.
- **WhatsApp por QR (`WHATSAPP_WEB`, GoWA, unofficial) is operator-only**: `Organization.channelWhatsappWebEnabled` is off by default and never set at signup; turning it off **stops** the channel (scope, sends, webhook), unlike the other flags. GoWA is never exposed (no ports, no browser calls) — `canales.md`.

## Events, API, webhooks, automations (detail: `integraciones.md`)

- **Code that changes a domain fact must emit its event** (`emitDomainEvent()`, never throws): `message.received/sent`, `contact.created`, `contact.lead_status_changed`, `tag.added`, `conversation.assigned/resolved`, `appointment.*`, `lead.scored`, `lead.ad_captured`. For lead status and contact tags call `afterLeadStatusChanged()` / `afterContactTagAdded()` instead of repeating side effects inline. A new `contact.created` source needs the union in `lib/events/types.ts` **and** the enum in `lib/api/openapi.ts`.
- Public API `/api/v1/*`: `withApiErrors` + `authenticateApiKey(req, scope)`; ids outside the scope answer **404, never 403**; update `lib/api/openapi.ts` in the same change as any route.
- **Customer MCP (`/api/v1/mcp`) has no business logic**: each tool calls the matching `/api/v1` handler in-process (`lib/mcp/customer/dispatch.ts`). A new tool adds a `ToolDef` (and, if needed, a route in `ROUTES`), never a Prisma query. Tools that send are `irreversible`. It is not the operator MCP (`/api/mcp`). Its OAuth connections are `ApiKey` rows (`oauthClientId`) bound in-process with `bindApiKeyHash()` — never store or reveal their secret, never accept an OAuth token on `/api/v1` REST.
- **`message.sent` has one emitter: `lib/events/message-sent.ts:emitMessageSent()`.** A new way to send sets `sentVia` (an `OUTBOUND_ORIGINS` value, `lib/messages/origin.ts`) on the saved row and calls it; a contract change bumps `API_SCHEMA_VERSION` + `API_CHANGELOG` (`integraciones.md`).
- **A message's public shape lives only in `lib/messages/serialize.ts`** (API and `message.*` webhooks share it); media go out as `GET /api/v1/messages/{id}/media`, never Meta's URL. Meta data that doesn't fit `body`/media goes to `WAMessage.content` via `structuredContentOf()` — don't drop fields into `[type]` markers.
- Any HTTP request to a user-supplied URL goes through `lib/net/safe-fetch.ts`.
- Automations: the graph is a tree; adding a step type = `types.ts` + `validate.ts` + `executor.ts` + `labels.ts` + editor form + tests. **Both ingests call `dispatchInboundMessage()` before enqueuing the bot** and skip it on `suppressBot` — a new inbound path must do the same. Don't add features to the legacy `WASequence`.
- Meta CAPI (`lib/meta/conversions.ts`) refuses to send unless TEST mode with `testEventCode` or `mode: LIVE` is explicit.

## CRM and inbox (detail: `crm.md`, `bandeja.md`)

- `Contact` is shared by both stacks (`accountId` XOR `channelAccountId`): scope contact queries with both. A name never regresses to a phone-number fallback (`isFallbackName()`). Show chat/contact names with `lib/chats/display-name.ts:displayName()` (turns web-widget visitor ids into "Visitante web · XXXX").
- Assignment candidates come from `lib/chat-assignees.ts` (`getEligibleAssignees` / `getEligibleChannelAssignees`); never trust a client-sent `assignedToId` or `tagId` without that check / `tagBelongsTo()`. Tags are per account.
- Automatic assignment also passes candidates through `lib/teams/rules.ts:teamCandidateIds()` (a chat with a team only goes to its members) and then `lib/users/availability.ts:assignableCandidateIds()` (the account's "solo en línea" switch); a new auto-assign path must do the same. Teams route chats, they never grant access.
- **SLA** (`lib/sla/`): a new path that reopens a RESOLVED chat sets `openedAt` (start of the resolution clock); `sla*BreachedFor` non-null means "out of SLA now" — only the tick writes it (`bandeja.md`).
- `WALeadScore` is keyed by `(chatId, scorerId)`; scoring logic lives only in `scoreChatWithScorer()`. Scheduled scoring stays Telegram-only on the channel side.
- **`leadRecoveryEnabled` sends real messages unattended** every 15 min — never enable it (or shrink its thresholds) in a DB pointing at real accounts without the user's explicit OK.
- Pipelines: `lib/pipeline/stages.ts:leadStatusForStage()` is the only status↔stage mapping; outcome changes write `LeadOutcomeEvent`. Don't compute funnels from `leadStatus` alone.
- Chat list filters live in `lib/chats/query.ts` (shared by both chat tables) — add new filters there. Callers must validate `accountId` against the user's accounts before passing it in.
- Snooze is a field (`snoozedUntil`), not a `ChatStatus`; ingest clears it on any inbound. Saved views and drafts are per-browser `localStorage`.
- **"Esperando respuesta" is `waitingSince`** on `WAChat`/`Conversation` (`lib/chats/waiting.ts`): both ingests call `markWaiting()`; a reply from a person, the bot or a conversational flow clears it (`markReplied()` or `waitingSince: null` in the same update), and so does resolving. Automatic notices (away message, auto-resolve, CSAT, campaigns, recovery) must **not** clear it — `sendOutbound(..., { countsAsReply: false })`. A new path that answers a customer must clear it; `lib/chats/__tests__/waiting.test.ts` guards the existing call sites.
- `/whatsapp/chat`'s rail keeps its own dense structure — confirm with the user before restructuring it.
- No websockets anywhere: polling is the pattern for anything live, always through `app/components/ui/use-poll.ts:usePoll()` (no overlap, paused when hidden, slower when idle) with the GET answered by `jsonWithEtag()`. The inbox polls **one** endpoint, `/api/inbox/sync` — extend it instead of adding a new poll there (`bandeja.md`).
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
- Two-step verification (`lib/two-factor.ts`, TOTP in `lib/totp.ts`) runs inside the same Credentials `authorize`: a new sign-in path must not bypass it. Its secrets live on `User` (encrypted) — never return a `User` row without `select`. Logging out other sessions bumps `sessionVersion`; the caller keeps its own session only through the one-time nonce (`lib/session-nonce.ts`), never by trusting `update()` data.

## Framework quirks (detail: `frontend.md`)

- `proxy.ts` IS the middleware (Next 16), not `middleware.ts`.
- `params`/`searchParams` in pages and route handlers are `Promise<>` — `await` them.
- Server Components can't pass functions (Lucide icons, `render` callbacks, `<Button icon={…}>`) to Client Components: split into `page.tsx` (RSC, data) + `_view.tsx` (`"use client"`), or a small client wrapper.
- Pages using `useSearchParams()` must be wrapped in `<Suspense>`.
- After adding/removing routes, clear the `next_cache` volume (stop app, empty the volume, start app) — a stale Turbopack cache causes 404/500s or an infinite reload loop. The exact command is in `frontend.md`.
- `Modal` initializes `visible` from `open` — auto-open-via-URL modals depend on it.
- Never use Tailwind `dark:` (it follows the OS, not the app toggle); use semantic tokens.
- RSC pages get a sibling `loading.tsx` with a skeleton that mirrors the page.

## Dirección de diseño (congelada, nov 2026)

**No cambiar paleta, fuentes ni metáfora visual sin aprobación explícita de Luis. Las propuestas van en un issue, no en un commit.** Fuente de verdad: `app/globals.css` (hex espejo en `lib/brand-colors.ts`, `docs/COLOR.md`, `.impeccable/design.json`).
- **Astryx (aprobado, 2026-11-21):** `themes/colibly/` se desvía de esta lista a propósito (`rediseno-astryx/DECISION.md`); no lo reviertas.
- **Color (claro):** fondo `#F4F4F1` · superficie `#FFFFFF` · superficie 2 `#EEEEEA` · `--nav-active` `#E6E6E1` · filete `#E1E1DB` · `--border-strong` `#93948D` (inputs, selects, checkbox) · tinta `#17181A` · `--muted` `#5E5F5A` · `--subtle` `#8A8B84` (solo metadatos ≥ 12 px y placeholders) · acento `#0F6E7E` / hover `#0B5864` / ink `#0B5D6A` / subtle `#E3F0F1` / muted `#A9CFD4` · éxito `#1F6B45` · warning `#9A4A0B` (solo espera/SLA) · peligro `#B3261E` · info `#2F5D8A` · burbujas `#FFFFFF` / `#DCEFEC` sobre `#EEEEEA` · series `#0F6E7E #7A6A3A #5B6FA6 #9C5B7A #8A8B84` · hues de cuenta oklch con croma 0.09. **Oscuro (uno solo):** `#111211` / `#18191A` / `#222321` / filete `#2E2F2C` / texto `#ECECE8` / texto 2 `#A3A49E` / relleno `#0F6E7E` + blanco / texto de acento y foco `#5FB8C4`. Sin coral, sin cian, sin AMOLED.
- **Fuentes:** Barlow 400/500/600 y Barlow Condensed 600/700 (solo cifras). Máximo 600 en el panel (nada de `font-bold`/`font-extrabold`). Escala: `text-micro` 11/16 500 · `text-xs` 12/16 500 · `text-sm` 13/18 (cuerpo de UI) · `text-base` 15/22 (burbujas, párrafos) · `text-title` 16/22 600 · `text-page-title` 22/28 600 Barlow normal · `text-figure` 28/32 Condensed 600 tabular · `text-hero` 40/44 (solo 404/500). Peso 500 en nombres de listas, botones y navegación.
- **Radios:** `rounded-xs` 4 (badges, chips, checkbox) · `rounded-sm` 6 (botones, inputs, menús) · `rounded-md` 8 (tarjetas del embudo, popovers) · `rounded-lg` 10 (paneles, tablas, modales) · burbuja `rounded-bubble-in/out` (10 con cola de 3) · `rounded-full` solo avatares, puntos de estado y switch. Nada de `rounded-xl`/`2xl`/`[9px]` en el panel.
- **Sombras:** ninguna en reposo; `shadow-sm` arrastre/hover, `shadow-md` menús y ⌘K, `shadow-lg` modales. Sin animaciones de entrada: solo color en 120 ms y apertura de menús/modales; respetar `prefers-reduced-motion`.
- **Componentes:** botón 28/32/40, un solo primario teal por vista, secundario blanco con borde, ghost para acciones de fila · input blanco con `--border-strong`, foco borde acento + anillo 2 px `--accent-subtle` · badge sin borde, radio 4, `text-xs` · tabla con encabezado `bg-surface-light` `text-xs` 500 sin mayúsculas, números a la derecha `tabular-nums`, fila 40 px · estado vacío sin `IconBox`: ícono 20 px `--subtle` opcional, titular de 3-5 palabras, ≤ 1 línea y 1 CTA · `KpiStrip` una superficie con divisores, etiqueta en minúscula, cifra `text-figure` · `PageHeader` 56 px, subtítulo solo si es dato vivo · menú 232 px, ítems 30 px, íconos 16 px, activo `bg-nav-active`, grupos sin mayúsculas · íconos nunca en cuadros de color (salvo logos de canal); sin `Sparkles`.
- **Textos:** español de México, tuteo, sin signos de admiración. Vocabulario: Chats, Contactos, Embudo, Etapa, Venta ganada / perdida, Asignado a, Canal, Número; "contacto" (no "lead") y "trato" para la tarjeta del embudo.

## Design system (detail: `frontend.md`)

- Colors only through semantic tokens (`bg-surface`, `text-foreground`, `text-muted`, `text-accent-ink`, `bg-accent` + `text-on-accent`, `border-accent-strong`, `bg-accent-subtle`…). **Never Tailwind color literals, never `text-accent`, never opacity modifiers on the accent.** Hex copies for emails/images live in `lib/brand-colors.ts` — change both together. Add new token pairs to `lib/design/__tests__/contrast.test.ts`. There must be exactly one `.dark {` block in `globals.css`.
- Never write inline button/card/input classes; use the components in `app/components/ui/` (small controls — text/icon buttons, `Segmented`, `rowHref` for rows that navigate — in `frontend.md`). Forms: `<FormField label error>{(id) => <Input id={id}/>}</FormField>`. Toasts: `useToast()`. Selects: `select.tsx` / `multi-select.tsx` / `searchable-select.tsx` — don't build a fourth.
- Lists use `EntityList`/`EntityRow`; overview pages use `PageHeader` → `KpiStrip` → `Workbench` + `SectionHeader`; dense numeric reports use `<Table>`. CRUD is a `_form.tsx` next to the list (`whatsapp/plantillas/_form.tsx` is the reference): a `Modal` when short, `<Modal layout="drawer">` (side drawer, full screen on phones) from 6 fields up. A modal only when the task must interrupt (one-time secret, security, irreversible action, blocking step); one field goes inline (`docs/INVENTARIO_MODALES_2026-11-07.md`). A page root with `max-w-*` must also have `mx-auto`.
- Per-entity hue: for accounts use `useHueClass()` (client, `ui/account-hues.tsx`) or `hueClassIn(await getOrgAccountHues(orgId), id)` (server) — assigned per organization without collisions; `hueClassFor(id)` (plain hash) only for non-account entities.
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
