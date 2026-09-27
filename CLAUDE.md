# CLAUDE.md

The product is **SunflowCRM** (formerly SundayCRM; internal names like the repo folder keep the old one). Use `lib/brand.ts:BRAND_NAME` in user-facing text.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Everything runs in containers — never install dependencies or run Node/Postgres/Redis on the host. `docker compose` and `podman compose` are interchangeable here (same compose CLI); on the shared server development uses **Podman rootless**, which is why every bind mount in the compose files carries `:z` (SELinux) — keep it on new mounts, Docker ignores it.

```bash
docker compose up --build                       # dev stack (app + postgres + redis), hot reload on :15100
docker compose exec app npx tsc --noEmit        # type check
docker compose exec app npm run lint            # eslint (flat config, eslint-config-next)
docker compose exec app sh scripts/new-migration.sh <nombre>   # schema.prisma changed → create + apply a migration (NOT `migrate dev`, NOT `db push`)
docker compose restart app                      # required after a migration — see AGENTS.md "Dev container needs a restart"
```

CI (`.github/workflows/ci.yml`) runs the same `tsc` + lint + tests plus the `builder` stage build on every PR and push to `main`. Tests exist only for pure logic with delicate rules (`lib/**/__tests__/*.test.ts`, vitest): `docker compose exec app npm test`. Everything else is verified with `tsc --noEmit` + `npm run lint` + a production build, plus manual click-through for UI changes. For a single file use `npx eslint <path>`; `tsc` has no single-file mode that respects the path aliases, so it always runs whole-project.

Outgoing email in dev (verification, password reset, invitations) never leaves the machine: the override points SMTP at Mailpit, inbox at `http://localhost:18025` (API `/api/v1/messages`).

### The dev server is on port 15100 — open it as `localhost` or `ludaisca`

`docker-compose.override.yml` maps `15100:5000`. Use `http://localhost:15100` or, from another machine over Tailscale, `http://ludaisca:15100` — **not** `127.0.0.1` or any other name: Next's dev server blocks `/_next/*` for origins outside `allowedDevOrigins` (`next.config.ts`), so the page loads but never hydrates — forms submit as plain GETs (`/login?`) and nothing interactive works, with only a "Blocked cross-origin request" line in the server log. A new hostname goes into that list (same names as WAB/Factzi). `curl` against API routes works on any host.

### Production build check

Build the Dockerfile's `builder` stage in an isolated image — exactly what Coolify runs (`npm ci`, `prisma generate`, `next build` with `NODE_OPTIONS` set), without touching the dev container, `node_modules`, `.next` or `package.json`:

```bash
podman build --target builder -t localhost/sundaycrm-buildcheck:tmp . && podman rmi localhost/sundaycrm-buildcheck:tmp
```

`npm run build` inside the dev container fails while prerendering (`NODE_ENV=development` poisons the production build) — don't use it. To check the production *startup* (migrations + healthcheck), build `--target runner` and run it against a throwaway database on the compose network.

## Multi-tenant: every query is scoped to the organization

SundayCRM is a hosted multi-tenant SaaS (see AGENTS.md → "Architecture: tenancy"). The rules that prevent cross-tenant leaks:

- A new top-level model gets `organizationId`, and its create sets it via `requireOrgId(session.user.id)`.
- Every required relation must be `onDelete: Cascade` down from `Organization`: deleting an organization (owner deletion, the 60-day purge) is one cascading delete (`lib/org-data/delete.ts`). Data that cascade can't reach — files on disk, rows linked only through a join table — has to be added to that function.
- Admin resources are filtered with `orgWhere(userId)`, accounts through `getUserAccountIds()`/`getUserChannelAccountIds()`, account edits/shares with `accountManageWhere(userId)` — **never** `userId: session.user.id` for something the organization shares.
- `tsc` can't catch a missing scope — check a new route with a second organization (signup creates one) before calling it done.
- Billing gates are the same kind of thing `tsc` won't catch: a new way to **send** a message must go through a sender that calls `assertOrgCanSend()`, a new **worker/tick** must skip organizations that aren't writable (`isOrgWritable` / `isAccountWritable` / `isBotWritable`) *before* calling the AI, and a new **countable resource** needs its `checkPlanLimit()` at creation (see AGENTS.md → "Billing").
- A new **AI call** reserves a credit with `reserveAiCredit(organizationId)` after checking `getPlatformApiKey()` and before calling the provider — there are no per-user API keys anymore (AGENTS.md → "AI providers").
- A new **server env var** must also be added to the `app.environment` list of `docker-compose.yml`, or it won't exist in production.

## Architecture: two parallel channel stacks

The app began WhatsApp-only and gained generic channels (Telegram, then Messenger/Instagram) through an **adapter layer rather than a migration** — the `WA*` tables hold production data and were deliberately left untouched.

| | WhatsApp | Other channels (Telegram/Messenger/Instagram) |
|---|---|---|
| Account | `WAAccount` (Meta credentials as flat columns) | `ChannelAccount` (`channel` enum + one encrypted JSON `credentials` blob) |
| Thread | `WAChat` (`remoteJid`) | `Conversation` (`externalId`) |
| Message | `WAMessage` (`wamid`) | `ChannelMessage` (`externalMessageId`) |
| Client | `lib/whatsapp.ts` | `lib/telegram.ts` / `lib/meta-messaging.ts` |
| Ingest | `lib/whatsapp/ingest-message.ts` | `lib/telegram/ingest-message.ts` / `lib/meta-messaging/account-crud.ts` |
| Webhook | `/api/whatsapp/webhook` (one URL, disambiguated by `phone_number_id`) | `/api/telegram/webhook/[accountId]` (URL identifies the account; the `X-Telegram-Bot-Api-Secret-Token` header authenticates) and `/api/meta/webhook/messaging` (Messenger/Instagram, `X-Hub-Signature-256`) |

What the two worlds share:

- **`Contact`.** `accountId` and `channelAccountId` are both nullable and mutually exclusive at the application level. Any query scoping contacts must cover both, and the compound uniques (`[accountId, remoteJid]`, `[channelAccountId, remoteJid]`) rely on Postgres treating NULLs as non-colliding.
- **`WABot`**, the same way (`waAccountId` XOR `channelAccountId`). The `bot-messages` queue carries both kinds of job; `lib/workers/index.ts` routes on payload shape (`conversationId` present ⇒ channel) rather than a flag. Same pattern in `media-download` and `bot-message-send`, which use an explicit `channel` field.
- **`lib/chat-resolver.ts:resolveChatChannel()`** — why `/api/whatsapp/chats/[chatId]/{messages,status,send,assign,assignees,usage}` serve both channels: a `chatId` may be a `WAChat.id` *or* a `Conversation.id`, and the handler branches internally. It returns the caller's `accountIds` alongside the channel so handlers don't re-run `getUserAccountIds()`. New per-chat routes should follow this shape instead of being duplicated under `/api/telegram/`.
- **The inbox UI.** `chat-workspace.tsx` fetches `/api/whatsapp/chats` and `/api/telegram/chats` (identical response shapes plus a `channel` discriminator) and merges them. Each source paginates over its own total, so "load more" derives a page **per channel** from how many of that channel's chats are already loaded, then dedupes by id on append. `ChannelAccountShare` gives channel accounts the same sharing `WAAccountShare` gives WhatsApp accounts (shared from the "Compartir" action in each channel account list) — always resolve via `getUserChannelAccountIds()`, never `channelAccount: { userId }`.

**Generic channels deliberately lack** (guarded in the UI, not merely absent): campaigns/templates (Meta-specific concepts), lead scoring, chat tags, and — for Messenger/Instagram — outbound media is two-step (upload → `attachment_id`) and AI input is text-only.

### Cross-channel traps that have already caused bugs

- **Telegram's `message_id` is unique per chat, not per bot** — it restarts at 1 in every new conversation. Deduplicating inbound messages by `externalMessageId` across a whole account silently discards real messages. Scope the check to the conversation, matching `@@unique([conversationId, externalMessageId])`. Meta's `wamid` *is* globally unique, which is why the WhatsApp code looks different and must not be copied verbatim.
- **`proxy.ts` runs all three role checks inside the `PROTECTED` block.** A route missing from that list skips `EXECUTIVE_BLOCKED`/`USER_BLOCKED` entirely — not just the login redirect — even when a layout already redirects unauthenticated users. Every new top-level section must be added to `PROTECTED`.
- **Automations and the bot share the chat.** Both ingests call `dispatchInboundMessage()` *before* enqueuing the bot and skip the bot when it returns `suppressBot`; `getBotSkipReason()` also checks for a conversational run. A new inbound path (another channel) must do the same, or the bot and a button flow will both answer.
- **A `where.OR` used for account scoping gets overwritten by one used for search.** Combine them under `AND` (see `GET /api/whatsapp/contacts`); assigning both to `where.OR` leaks other users' rows.

## Navigation

`app/(dashboard)/dashboard-shell.tsx` builds `NAV[]` from `useSession().user.role`: five groups for admin/user (Principal · Automatización · Difusión WhatsApp · Canales · Ajustes) and a reduced two-group nav for `ejecutivo`. "Difusión **WhatsApp**" carries its scope in the name on purpose — templates and campaigns are Meta-only. When restricting anything new, follow the established defense-in-depth shape: hide the nav item → block the route in `proxy.ts` → 403 in the API.
