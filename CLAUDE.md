# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The product is **Colibly** (`colibly.com`; formerly SunflowCRM and SundayCRM). Repo, folder, containers, database and npm package are all named Colibly. Use `lib/brand.ts` (`BRAND_NAME`, `BRAND_DOMAIN`, `BRAND_CONTACT_EMAIL`) in user-facing text, never a literal, and colors only through the semantic tokens (palette "Colibrí"; hex copy for emails/images in `lib/brand-colors.ts`). The logo is still a provisional "C" — see `docs/PLAN_LANZAMIENTO.md`.

@AGENTS.md

## Commands

Everything runs in containers — never install dependencies or run Node/Postgres/Redis on the host. `docker compose` and `podman compose` are the same compose CLI, and the files work with both. **On the shared dev server (`ludaisca`) always use `podman compose`**: that host's Docker daemon is Coolify's production runtime. Rootless Podman under SELinux is also why every bind mount in the compose files carries `:z` — keep it on new mounts; Docker ignores it.

```bash
podman compose up --build                       # dev stack (app + postgres + redis + mailpit), hot reload on :15100
podman compose exec app npx tsc --noEmit        # type check (whole project only)
podman compose exec app npm run lint            # eslint (flat config, eslint-config-next)
podman compose exec app npx eslint <path>       # lint one file or folder
podman compose exec app npm test                # vitest: lib/**/__tests__/*.test.ts
podman compose exec app npx vitest run lib/billing            # one test folder/file
podman compose exec app npx vitest run lib/billing -t purgeDue  # tests whose name matches
podman compose exec app sh scripts/new-migration.sh <nombre>   # schema.prisma changed → create + apply a migration (NOT `migrate dev`, NOT `db push`)
podman compose restart app                      # after a migration or worker-code change; `.env` changes need `podman compose up -d app`
```

CI (`.github/workflows/ci.yml`) runs the same `tsc` + lint + tests plus the `builder` stage build on every PR and push to `main`. Tests exist only for pure logic with delicate rules (billing state machine, automations engine, contrast, SSRF guard, email templates); everything else is verified with `tsc --noEmit` + `npm run lint` + a production build, plus a real click-through for UI changes. `tsc` has no single-file mode that respects the path aliases, so it always runs whole-project.

Outgoing email in dev (verification, password reset, invitations) never leaves the machine: the override points SMTP at Mailpit, inbox at `http://localhost:18025` (API `/api/v1/messages`).

### The dev server is on port 15100 — open it as `localhost` or `ludaisca`

`docker-compose.override.yml` maps `15100:5000`. Use `http://localhost:15100` or, from another machine over Tailscale, `http://ludaisca:15100` — **not** `127.0.0.1` or any other name: Next's dev server blocks `/_next/*` for origins outside `allowedDevOrigins` (`next.config.ts`), so the page loads but never hydrates — forms submit as plain GETs (`/login?`) and nothing interactive works, with only a "Blocked cross-origin request" line in the server log. A new hostname goes into that list (same names as WAB/Factzi). `curl` against API routes works on any host.

### Production build check

Build the Dockerfile's `builder` stage in an isolated image — exactly what Coolify runs (`npm ci`, `prisma generate`, `next build` with `NODE_OPTIONS` set), without touching the dev container, `node_modules`, `.next` or `package.json`:

```bash
podman build --target builder -t localhost/colibly-buildcheck:tmp . && podman rmi localhost/colibly-buildcheck:tmp && podman image prune -f
```

The final `podman image prune -f` matters: `rmi` only drops the tag, and each build's intermediate layers stay behind as untagged images — they filled the 39 GB Podman LV to 97 % by 2026-09-27. (Clearing space on that LV: `podman image prune -a -f` removes images no container uses; never `--volumes`, those are other projects' dev databases, and they live on the RAID anyway.)

`npm run build` inside the dev container fails while prerendering (`NODE_ENV=development` poisons the production build) — don't use it. To check the production *startup* (migrations + healthcheck), build `--target runner` and run it against a throwaway database on the compose network.

## Multi-tenant: every query is scoped to the organization

Colibly is a hosted multi-tenant SaaS (see AGENTS.md → "Architecture: tenancy"). The rules that prevent cross-tenant leaks:

- A new top-level model gets `organizationId`, and its create sets it via `requireOrgId(session.user.id)`.
- Every required relation must be `onDelete: Cascade` down from `Organization`: deleting an organization (owner deletion, the 60-day purge) is one cascading delete (`lib/org-data/delete.ts`). Data that cascade can't reach — files on disk, rows linked only through a join table — has to be added to that function.
- Admin resources are filtered with `orgWhere(userId)`, accounts through `getUserAccountIds()`/`getUserChannelAccountIds()`, account edits/shares with `accountManageWhere(userId)` — **never** `userId: session.user.id` for something the organization shares.
- `tsc` can't catch a missing scope — check a new route with a second organization (signup creates one) before calling it done.
- Billing gates are the same kind of thing `tsc` won't catch: a new way to **send** a message must go through a sender that calls `assertOrgCanSend()`, a new **worker/tick** must skip organizations that aren't writable (`isOrgWritable` / `isAccountWritable` / `isBotWritable`) *before* calling the AI, and a new **countable resource** needs its `checkPlanLimit()` at creation (see AGENTS.md → "Billing").
- A new **AI call** reserves a credit with `reserveAiCredit(organizationId)` after checking `getPlatformApiKey()` and before calling the provider — there are no per-user API keys anymore (AGENTS.md → "AI providers").
- A new **server env var** must also be added to the `app.environment` list of `docker-compose.yml`, or it won't exist in production.

## Architecture: two parallel channel stacks

The app began WhatsApp-only and gained generic channels (Telegram, then Messenger/Instagram) through an **adapter layer rather than a migration** — the `WA*` tables hold production data and were deliberately left untouched.

| | WhatsApp | Other channels (Telegram/Messenger/Instagram/Web widget) |
|---|---|---|
| Account | `WAAccount` (Meta credentials as flat columns) | `ChannelAccount` (`channel` enum + one encrypted JSON `credentials` blob) |
| Thread | `WAChat` (`remoteJid`) | `Conversation` (`externalId`) |
| Message | `WAMessage` (`wamid`) | `ChannelMessage` (`externalMessageId`) |
| Client | `lib/whatsapp.ts` | `lib/telegram.ts` / `lib/meta-messaging.ts` |
| Ingest | `lib/whatsapp/ingest-message.ts:ingestInboundMessage()` | `lib/telegram/ingest-message.ts:ingestChannelMessage()` — shared by every generic channel despite the folder name |
| Webhook | `/api/whatsapp/webhook` (one URL, disambiguated by `phone_number_id`) | `/api/telegram/webhook/[accountId]` (URL identifies the account; the `X-Telegram-Bot-Api-Secret-Token` header authenticates) `/api/meta/webhook/messaging` (Messenger/Instagram, `X-Hub-Signature-256`) and the public `/api/webchat/[accountId]/*` routes (web widget: we are the provider, auth is a self-signed session token) |

What the two worlds share:

- **`Contact`.** `accountId` and `channelAccountId` are both nullable and mutually exclusive at the application level. Any query scoping contacts must cover both, and the compound uniques (`[accountId, remoteJid]`, `[channelAccountId, remoteJid]`) rely on Postgres treating NULLs as non-colliding.
- **`WABot`**, the same way (`waAccountId` XOR `channelAccountId`). The `bot-messages` queue carries both kinds of job; `lib/workers/index.ts` routes on payload shape (`conversationId` present ⇒ channel) rather than a flag. Same pattern in `media-download` and `bot-message-send`, which use an explicit `channel` field.
- **`lib/chat-resolver.ts:resolveChatChannel()`** — why `/api/whatsapp/chats/[chatId]/{messages,status,send,assign,assignees,usage}` serve both channels: a `chatId` may be a `WAChat.id` *or* a `Conversation.id`, and the handler branches internally. It returns the caller's `accountIds` alongside the channel so handlers don't re-run `getUserAccountIds()`. New per-chat routes should follow this shape instead of being duplicated under `/api/telegram/`.
- **The inbox UI.** `chat-workspace.tsx` fetches `/api/whatsapp/chats` and `/api/telegram/chats` (identical response shapes plus a `channel` discriminator) and merges them. Each source paginates over its own total, so "load more" derives a page **per channel** from how many of that channel's chats are already loaded, then dedupes by id on append. `ChannelAccountShare` gives channel accounts the same sharing `WAAccountShare` gives WhatsApp accounts (shared from the "Compartir" action in each channel account list) — always resolve via `getUserChannelAccountIds()`, never `channelAccount: { userId }`.

**Generic channels deliberately lack** (guarded in the UI, not merely absent): campaigns/templates (Meta-specific concepts), lead scoring, chat tags, and — for Messenger/Instagram — outbound media is two-step (upload → `attachment_id`) and AI input is text-only.

### Cross-channel traps that have already caused bugs

- **Telegram's `message_id` is unique per chat, not per bot** — it restarts at 1 in every new conversation. Deduplicating inbound messages by `externalMessageId` across a whole account silently discards real messages. Scope the check to the conversation, matching `@@unique([conversationId, externalMessageId])`. Meta's `wamid` *is* globally unique, which is why the WhatsApp code looks different and must not be copied verbatim.
- **"Contacto" in the UI = `Person`; the Prisma `Contact` is a channel identity.** New CRM work (directory, owner, company, merge, import, views) lives in `lib/crm/` + `/api/crm/*` and is org-scoped; see AGENTS.md → "CRM directory". A `Contact` is never created without its `Person` — which is why creation only happens in `resolveContact()`.
- **Every way of creating or looking up a `Contact` goes through `lib/contacts/resolve.ts`** (`resolveContact` / `findContact` / `resolveRemoteJid`) — never a raw `prisma.contact.upsert`/`findUnique` on `accountId_remoteJid`. A Mexican mobile arrives as `52…` or `521…` depending on the path; each caller used to create its own contact *and chat*, so the same person was duplicated. The resolver returns the `remoteJid` the person already exists under: use **that** (not the raw one) for the `WAChat`/`Conversation` too, and for `remoteJid: { in: … }` lookups use `remoteJidCandidates()` (groups `@g.us` are not phones). Contact deletion is `lib/contacts/delete.ts` (chat → `SetNull`, so it deletes chat/conversation/media itself).
- **`proxy.ts` runs all three role checks inside the `PROTECTED` block.** A route missing from that list skips `EXECUTIVE_BLOCKED`/`USER_BLOCKED` entirely — not just the login redirect — even when a layout already redirects unauthenticated users. Every new top-level section must be added to `PROTECTED`.
- **Automations and the bot share the chat.** Both ingests call `dispatchInboundMessage()` *before* enqueuing the bot and skip the bot when it returns `suppressBot`; `getBotSkipReason()` also checks for a conversational run. A new inbound path (another channel) must do the same, or the bot and a button flow will both answer.
- **A `where.OR` used for account scoping gets overwritten by one used for search.** Combine them under `AND` (see `GET /api/whatsapp/contacts`); assigning both to `where.OR` leaks other users' rows.

## Beta landing and host split (prepared in DEV, not deployed)

Three copies of the public landing coexist; see `docs/CONTINUIDAD_LANDING_CPANEL_2026-10-01.md` for state and next steps: `app/(marketing)/page.tsx` (original), `app/(beta)/beta/` (beta, Next.js) and `cpanel-site/` (independent PHP copy for `colibly.com` on Neubox/cPanel — no Next.js, no DB; its text must be kept in sync with the Next.js beta by hand). With `SITE_URL` set (`colibly.com`) next to `APP_URL` (`app.colibly.com`), `proxy.ts` splits hosts: the app host redirects landing paths to the site host and vice versa. The trial is 30 days everywhere (`TRIAL_DAYS = 30` in `lib/billing/plans.ts`; the landing and terms read it, `cpanel-site/terminos.php` repeats it by hand — change both together). The beta typography is Bricolage Grotesque (display) + Hanken Grotesk (body), the same as the app; `cpanel-site/assets/site.css` mirrors it. Index of all planning/audit documents: `docs/README.md`.

## Navigation

`app/(dashboard)/dashboard-shell.tsx` builds `NAV[]` from `useSession().user.role`: five groups for admin/user (Principal · Automatización · Difusión WhatsApp · Canales · Ajustes) and a reduced two-group nav for `ejecutivo`, plus a "Plataforma" group (`/plataforma`, the operator panel) only for emails in `PLATFORM_ADMIN_EMAILS` — that access is not a role and is checked in `plataforma/layout.tsx` and every `/api/plataforma` handler. "Difusión **WhatsApp**" carries its scope in the name on purpose — templates and campaigns are Meta-only. When restricting anything new, follow the established defense-in-depth shape: hide the nav item → block the route in `proxy.ts` → 403 in the API.
