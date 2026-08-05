# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Everything runs in Docker — never install dependencies or run Node/Postgres/Redis on the host.

```bash
docker compose up --build                       # dev stack (app + postgres + redis), hot reload on :15100
docker compose exec app npx tsc --noEmit        # type check
docker compose exec app npm run lint            # eslint (flat config, eslint-config-next)
docker compose exec app npx prisma db push      # apply schema.prisma changes to the dev DB
docker compose exec app npx prisma generate     # regenerate Prisma client after schema changes
docker compose restart app                      # required after db push — see AGENTS.md "Dev container needs a restart"
```

There is no test suite (no `test` script in `package.json`). Verification is `tsc --noEmit` + `npm run lint` + a production build, plus manual click-through for UI changes. For a single file use `npx eslint <path>`; `tsc` has no single-file mode that respects the path aliases, so it always runs whole-project.

### The dev server is on port 15100, not 3001

`docker-compose.override.yml` maps `15100:5000`. Port **3001 belongs to `sunday-crm-app-1`** — a sibling container running [SundayCRM](https://github.com/ludaisca/SundayCRM), the upstream project this repo was forked from. Both apps serve `/whatsapp/*` and look nearly identical, so hitting 3001 by mistake yields plausible-but-wrong results (stale UI, "no session", 404s on routes added here) rather than an obvious error. The page `<title>` distinguishes them: this app renders "SundayCRM", SundayCRM renders "SundayCRM". Confirm with `docker ps --format "table {{.Names}}\t{{.Ports}}"`.

### Production build check

`docker compose exec app npm run build` fails while prerendering — the dev container sets `NODE_ENV=development`, which poisons the production build. Use a throwaway container instead, but note it mounts its **own anonymous `node_modules` volume** (`- /app/node_modules` in the override), so that volume starts with no installed packages and no generated Prisma client:

```bash
docker compose run --rm -e NODE_ENV=production -e NODE_OPTIONS="--max-old-space-size=6144" \
  app sh -c "npm install && npx prisma generate && rm -rf .next && npm run build"
```

All four steps must be in the *same* invocation. Without `npm install` it fails on the first dependency missing from the image (`motion/react`); without `prisma generate`, on any model added since the image was built; without `NODE_OPTIONS` it dies with "JavaScript heap out of memory" (V8 caps itself near 2 GB in-container regardless of host RAM).

Afterwards restore the dev state — the build leaves two side effects:

```bash
git checkout -- package.json package-lock.json   # npm install rewrites devDeps from ^ranges to exact pins
docker compose exec -u root app sh -c "rm -rf .next" && docker compose restart app
```

## Architecture: two parallel channel stacks

> **AGENTS.md predates this and describes a WhatsApp-only app.** Where the two disagree, this section is current; everything AGENTS.md says about WhatsApp itself still holds.

The app began WhatsApp-only and gained a second channel (Telegram) through an **adapter layer rather than a migration** — the `WA*` tables hold production data and were deliberately left untouched.

| | WhatsApp | Other channels (Telegram today) |
|---|---|---|
| Account | `WAAccount` (Meta credentials as flat columns) | `ChannelAccount` (`channel` enum + one encrypted JSON `credentials` blob) |
| Thread | `WAChat` (`remoteJid`) | `Conversation` (`externalId`) |
| Message | `WAMessage` (`wamid`) | `ChannelMessage` (`externalMessageId`) |
| Client | `lib/whatsapp.ts` | `lib/telegram.ts` |
| Ingest | `lib/whatsapp/ingest-message.ts` | `lib/telegram/ingest-message.ts` |
| Webhook | `/api/whatsapp/webhook` (one URL, disambiguated by `phone_number_id`) | `/api/telegram/webhook/[accountId]` (URL identifies the account; the `X-Telegram-Bot-Api-Secret-Token` header authenticates) |

What the two worlds share:

- **`Contact`.** `accountId` and `channelAccountId` are both nullable and mutually exclusive at the application level. Any query scoping contacts must cover both, and the compound uniques (`[accountId, remoteJid]`, `[channelAccountId, remoteJid]`) rely on Postgres treating NULLs as non-colliding.
- **`WABot`**, the same way (`waAccountId` XOR `channelAccountId`). The `bot-messages` queue carries both kinds of job; `lib/workers/index.ts` routes on payload shape (`conversationId` present ⇒ Telegram) rather than a flag. Same pattern in `media-download` and `bot-message-send`, which use an explicit `channel` field.
- **`lib/chat-resolver.ts:resolveChatChannel()`** — why `/api/whatsapp/chats/[chatId]/{messages,status,send,assign,assignees,usage}` serve both channels: a `chatId` may be a `WAChat.id` *or* a `Conversation.id`, and the handler branches internally. It returns the caller's `accountIds` alongside the channel so handlers don't re-run `getUserAccountIds()`. New per-chat routes should follow this shape instead of being duplicated under `/api/telegram/`.
- **The inbox UI.** `chat-workspace.tsx` fetches `/api/whatsapp/chats` and `/api/telegram/chats` (identical response shapes plus a `channel` discriminator) and merges them. Each source paginates over its own total, so "load more" derives a page **per channel** from how many of that channel's chats are already loaded, then dedupes by id on append.

**Telegram deliberately lacks** (guarded in the UI, not merely absent): campaigns/templates (Meta-specific concepts), lead scoring, chat tags, outbound media, and multimodal AI input. `ChannelAccount` also has no `WAAccountShare` equivalent, so its membership resolves through `channelAccount.userId` directly.

### Cross-channel traps that have already caused bugs

- **Telegram's `message_id` is unique per chat, not per bot** — it restarts at 1 in every new conversation. Deduplicating inbound messages by `externalMessageId` across a whole account silently discards real messages. Scope the check to the conversation, matching `@@unique([conversationId, externalMessageId])`. Meta's `wamid` *is* globally unique, which is why the WhatsApp code looks different and must not be copied verbatim.
- **`proxy.ts` runs all three role checks inside the `PROTECTED` block.** A route missing from that list skips `EXECUTIVE_BLOCKED`/`USER_BLOCKED` entirely — not just the login redirect — even when a layout already redirects unauthenticated users. Every new top-level section must be added to `PROTECTED`.
- **A `where.OR` used for account scoping gets overwritten by one used for search.** Combine them under `AND` (see `GET /api/whatsapp/contacts`); assigning both to `where.OR` leaks other users' rows.

## Navigation

`app/(dashboard)/dashboard-shell.tsx` builds `NAV[]` from `useSession().user.role`: five groups for admin/user (Principal · Automatización · Difusión WhatsApp · Canales · Ajustes) and a reduced two-group nav for `ejecutivo`. "Difusión **WhatsApp**" carries its scope in the name on purpose — templates and campaigns are Meta-only. When restricting anything new, follow the established defense-in-depth shape: hide the nav item → block the route in `proxy.ts` → 403 in the API.
