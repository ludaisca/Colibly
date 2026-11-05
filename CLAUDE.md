# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The product is **Colibly** (`colibly.com`; formerly SunflowCRM and SundayCRM). Repo, folder, containers, database and npm package are all named Colibly. Use `lib/brand.ts` (`BRAND_NAME`, `BRAND_DOMAIN`, `BRAND_CONTACT_EMAIL`) in user-facing text, never a literal, and colors only through the semantic tokens (palette "Laguna + coral", `docs/COLOR.md`; hex copy for emails/images in `lib/brand-colors.ts`). The logo is **Nexo** (geometric C + east triangle) — `BrandMark` / `lib/brand-mark.ts`; see `docs/PLAN_LANZAMIENTO.md`.

@AGENTS.md

Detail per module: `docs/arquitectura/` (map in AGENTS.md) — read the matching doc before changing a module and update it in the same change.

## Commands

Everything runs in containers — never install dependencies or run Node/Postgres/Redis on the host. **The dev server (`ludaisca`, Ubuntu 26.04) runs Docker** — rootful Docker Engine 29 + Compose v5, AppArmor, no SELinux, no Podman installed and no Coolify on this host (production lives elsewhere). The same Docker daemon also runs other projects (Factzi, Tesela, the `colibly-bench-*` stack), so only touch the `colibly` compose project. The `:z` on the compose bind mounts is a leftover from the previous Podman/SELinux host; it's harmless under Docker, keep it on new mounts so the files keep working on SELinux hosts.

```bash
docker compose up --build                       # dev stack (app + postgres + redis + mailpit), hot reload on :1100
docker compose exec app npx tsc --noEmit        # type check (whole project only)
docker compose exec app npm run lint            # eslint (flat config, eslint-config-next)
docker compose exec app npx eslint <path>       # lint one file or folder
docker compose exec app npm test                # vitest: lib/**/__tests__/*.test.ts
docker compose exec app npx vitest run lib/billing            # one test folder/file
docker compose exec app npx vitest run lib/billing -t purgeDue  # tests whose name matches
docker compose exec app sh scripts/new-migration.sh <nombre>   # schema.prisma changed → create + apply a migration (NOT `migrate dev`, NOT `db push`)
docker compose restart app                      # after a migration or worker-code change; `.env` changes need `docker compose up -d app`
docker compose exec db psql -U postgres -d colibly_db          # SQL shell (tables are snake_case via @@map; many columns stay camelCase — check `\d <table>`)
```

CI (`.github/workflows/ci.yml`) runs the same `tsc` + lint + tests plus the `builder` stage build on every PR and push to `main`. Tests exist only for pure logic with delicate rules (billing state machine, automations engine, contrast, SSRF guard, email templates); everything else is verified with `tsc --noEmit` + `npm run lint` + a production build, plus a real click-through for UI changes. `tsc` has no single-file mode that respects the path aliases, so it always runs whole-project.

Outgoing email in dev (verification, password reset, invitations) never leaves the machine: the override points SMTP at Mailpit, inbox at `http://localhost:1101` (API `/api/v1/messages`).

### The dev server is on port 1100 — open it as `localhost` or through Tailscale Serve

`docker-compose.override.yml` maps `1100:5000` and Docker publishes on `127.0.0.1` only (`docker-compose.data.yml`), so `ludaisca:1100` never answers. Use `http://localhost:1100`, or from another machine over Tailscale the HTTPS URL `https://ludaisca.taila2291d.ts.net:10100` (`tailscale serve` → `127.0.0.1:1100`). Next's dev server blocks `/_next/*` for origins outside `allowedDevOrigins` (`next.config.ts`), so with any other name the page loads but never hydrates — forms submit as plain GETs (`/login?`) and nothing interactive works, with only a "Blocked cross-origin request" line in the server log. A new hostname goes into that list (same names as WAB/Factzi). `curl` against API routes works on any host.

**Port convention for the whole server** (details in `docs/arquitectura/desarrollo.md` → "Puertos"): one block per project — Colibly 1000-1999 (serve 10000-10999), Factzi 2000-2999 (20000-20999), Tesela 3000-3999 (30000-30999). Serve port = local port with a `0` in front. Inside a block: `x100` app, `x101-x199` auxiliaries (Mailpit = 1101), `x200-x299` benchmarks, `x900-x999` temporary previews. Publish on `127.0.0.1` only, never use Funnel ports (443/8443/10000), never bring a port from outside the block.

### Production build check

Build the Dockerfile's `builder` stage in an isolated image — exactly what Coolify runs in production (`npm ci`, `prisma generate`, `next build` with `NODE_OPTIONS` set), without touching the dev container, `node_modules`, `.next` or `package.json`:

```bash
docker build --target builder -t colibly-buildcheck:tmp . && docker rmi colibly-buildcheck:tmp && docker image prune -f
```

The final `docker image prune -f` matters: `rmi` only drops the tag, and each build's intermediate layers stay behind as dangling images (on the previous host they filled the image volume to 97 %). Here Docker's data lives in `/var/lib/docker` on the root LV (108 GB, ~79 % used on 2026-11-01), shared with the OS and the other projects — check `df -h /` before a series of builds. To free space: `docker image prune -f` / `docker builder prune -f`; never `docker system prune --volumes` or `docker volume prune` — the volumes are other projects' dev databases.

`npm run build` inside the dev container fails while prerendering (`NODE_ENV=development` poisons the production build) — don't use it. To check the production *startup* (migrations + healthcheck), build `--target runner` and run it against a throwaway database on the compose network.

## Multi-tenant: every query is scoped to the organization

Colibly is a hosted multi-tenant SaaS (see `docs/arquitectura/tenencia-y-roles.md`). The rules that prevent cross-tenant leaks:

- A new top-level model gets `organizationId`, and its create sets it via `requireOrgId(session.user.id)`.
- Every required relation must be `onDelete: Cascade` down from `Organization`: deleting an organization (owner deletion, the 60-day purge) is one cascading delete (`lib/org-data/delete.ts`). Data that cascade can't reach — files on disk, rows linked only through a join table — has to be added to that function.
- Admin resources are filtered with `orgWhere(userId)`, accounts through `getUserAccountIds()`/`getUserChannelAccountIds()`, account edits/shares with `accountManageWhere(userId)` — **never** `userId: session.user.id` for something the organization shares.
- `tsc` can't catch a missing scope — check a new route with a second organization (signup creates one) before calling it done.
- Billing gates are the same kind of thing `tsc` won't catch: a new way to **send** a message must go through a sender that calls `assertOrgCanSend()`, a new **worker/tick** must skip organizations that aren't writable (`isOrgWritable` / `isAccountWritable` / `isBotWritable`) *before* calling the AI, and a new **countable resource** needs its `checkPlanLimit()` at creation (see `docs/arquitectura/billing.md`).
- A new **AI call** reserves a credit with `reserveAiCredit({ userId })` (a person asked) or `reserveAiCredit({ channel })` (automatic on a chat: the channel owner pays) after checking `getPlatformApiKey()` and before calling the provider — credits are per person since the license model (`docs/arquitectura/ia.md`, `billing.md`). Feature gates likewise go through `lib/billing/entitlements.ts`, not the org plan.
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
- **`proxy.ts` runs all three role checks inside the `PROTECTED` block.** A route missing from that list skips `EXECUTIVE_BLOCKED`/`USER_BLOCKED` entirely — not just the login redirect — even when a layout already redirects unauthenticated users. Every new top-level section must be added to `PROTECTED`.
- **Automations and the bot share the chat.** Both ingests call `dispatchInboundMessage()` *before* enqueuing the bot and skip the bot when it returns `suppressBot`; `getBotSkipReason()` also checks for a conversational run. A new inbound path (another channel) must do the same, or the bot and a button flow will both answer.
- **A `where.OR` used for account scoping gets overwritten by one used for search.** Combine them under `AND` (see `GET /api/whatsapp/contacts`); assigning both to `where.OR` leaks other users' rows.

## Beta landing and host split (prepared in DEV, not deployed)

The public landing lives in `app/(marketing)/page.tsx` (canonical `/`). `/beta` and `/producto` redirect to `/`. With `SITE_URL` (`colibly.com`) next to `APP_URL` (`app.colibly.com`), `proxy.ts` splits hosts: marketing on the site host, auth/app on the app host. `colibly.com` is served by this Next app (verified 2026-11-05); the old PHP copy `cpanel-site/` and its price generator were removed in the license Phase 4 — public pricing comes only from `app/(marketing)/_landing-offer-data.ts`, built from `lib/billing/licenses.ts` + `plans.ts`. Trial is 14 days (`TRIAL_DAYS` in `lib/billing/plans.ts`). Typography: Newsreader + Figtree (reserve Syne + DM Sans — `docs/TIPOGRAFIA.md`). Docs index: `docs/README.md`.

## Navigation

`app/(dashboard)/dashboard-shell.tsx` builds `NAV[]` from `useSession().user.role`: five groups for admin/user (Principal · Automatización · Difusión WhatsApp · Canales · Ajustes) and a reduced two-group nav for `ejecutivo`, plus a "Plataforma" group (`/plataforma`, the operator panel) only for emails in `PLATFORM_ADMIN_EMAILS` — that access is not a role and is checked in `plataforma/layout.tsx` and every `/api/plataforma` handler. "Difusión **WhatsApp**" carries its scope in the name on purpose — templates and campaigns are Meta-only. When restricting anything new, follow the established defense-in-depth shape: hide the nav item → block the route in `proxy.ts` → 403 in the API.
