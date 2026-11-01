# Redis + BullMQ

> Detalle técnico movido desde `AGENTS.md` (2026-11-01). Las reglas esenciales siguen en [`AGENTS.md`](../../AGENTS.md) y [`CLAUDE.md`](../../CLAUDE.md); aquí está el detalle completo. Mantén este archivo al día en el mismo cambio que el código.

## Redis + BullMQ

24 queues, auto-started via `instrumentation.ts`. **There are no per-job timeouts** — BullMQ 5 has no `timeout` job option (it used to be set and was silently ignored); the real time limit lives on every outbound HTTP call (`lib/http-timeouts.ts`: 20s JSON, 120s file transfer, 90s AI completions). The "Attempts" column is BullMQ retries.

| Queue | Concurrency | Attempts | Trigger |
|---|---|---|---|
| `bot-messages` | 3 | 3 | `ingestInboundMessage()` detects active bot → enqueues |
| `campaign-send` | 1 | 3 | "Enviar" on campaign — one job sends the whole campaign sequentially. Once Meta accepts a recipient's send, a later CRM bookkeeping error (contact/chat/tag upsert) no longer marks it `FAILED` |
| `campaign-schedule-tick` | 1 | 3 | Repeatable `scheduled-tick` (`* * * * *`) that claims due `SCHEDULED` campaigns (`processScheduledCampaignsTick()`, atomic `updateMany` on status so overlapping ticks can't double-enqueue) and enqueues them on `campaign-send`. Split into its own queue 2026-09-16: on `campaign-send` (concurrency 1) scheduled campaigns waited behind any campaign being sent. The `campaign-send` worker still handles a leftover `scheduled-tick` job and startup removes the old repeatable there |
| `rag-index` | 2 | 3 | User uploads knowledge document |
| `media-download` | 5 | 5 | `ingestInboundMessage()` with Meta `mediaId` → downloads binary bytes async |
| `media-cleanup` | 1 | 3 | Self-scheduled: `startWorkers()` registers a repeatable job (`repeat: {pattern: "0 3 * * *"}`, daily at 3am) on boot — not triggered by user action |
| `bot-message-send` | 5 | 3 | `bot-worker.ts` when `WABot.humanizeEnabled` is on — delivers each split chunk of a "humanized" reply as its own delayed job |
| `lead-scoring` | 1 | 3 | Self-scheduled repeatable tick (`*/5 * * * *`) — scheduled scorer runs, see "Lead scoring" |
| `lead-recovery` | 1 | 3 | Self-scheduled repeatable tick (`*/15 * * * *`) — re-engages silent leads, see "Lead recovery" |
| `sheets-sync` | 1 | 3 | Self-scheduled repeatable tick (`*/15 * * * *`) — syncs `GoogleAccount` spreadsheet exports |
| `lead-sheet-import` | 1 | 3 | Self-scheduled repeatable tick (`*/5 * * * *`) — imports leads from `LeadSheetSource` sheets |
| `meta-conversions` | 5 | 5 | `PATCH /api/whatsapp/contacts/[id]` enqueues when the contact's `leadStatus` changes on an ads-originated lead — sends the status change to Meta's Conversions API, see "Meta Ads" |
| `appointment-reminders` | 1 | 3 | Self-scheduled repeatable tick (`*/5 * * * *`) — notifies the assigned user shortly before a `WAAppointment` is due, see "Appointments/Citas" |
| `sequence-tick` | 1 | 3 | Self-scheduled repeatable tick (`*/5 * * * *`) — advances `WASequenceEnrollment` rows whose `nextRunAt` is due, see "Sequences (automatización lineal)" |
| `domain-events` | 5 | 3 | `emitDomainEvent()` (lib/events) — one job per domain event; fans out to matching webhooks, see "Eventos de dominio, API pública y webhooks" |
| `webhook-deliveries` | 5 | 6 | One HTTP delivery per `WebhookDelivery` (jobId = delivery id), backoff 30s exponential (≈30 min total) |
| `automation-run` | 5 | 1 | One job per run advance (`{runId}`), delayed for `wait` steps. BullMQ retries off on purpose: send failures get the runner's own backoff, see "Automatizaciones" |
| `automation-tick` | 1 | 3 | Self-scheduled repeatable tick (`* * * * *`) — `wait_for_reply` timeouts and a backstop for delayed jobs lost on a Redis restart |
| `coexistence-sync` | 1 | 5 | `sync` (asks Meta for contacts then history within 24 h of an Embedded Signup coexistence onboarding), `history-chunk` and `state-sync` (batches captured by the webhook), see "WhatsApp: Embedded Signup and coexistence" |
| `coexistence-tick` | 1 | 3 | Self-scheduled repeatable tick (`3,18,33,48 * * * *`) — retries/expires syncs, warns before the business token expires |
| `platform-backup` | 1 | 1 | Self-scheduled repeatable `tick` (`11,26,41,56 * * * *`) that asks `decideBackup()` whether today's scheduled backup is due, plus the manual `run` job from `/plataforma` → Respaldos. BullMQ retries are off on purpose: the tick retries (1 h apart, 3 per slot), see "Platform backups" |
| `platform-health` | 1 | 1 | Self-scheduled repeatable (`0 14 * * *` = 08:00 America/Mexico_City): the platform doctor, stores `PlatformHealthRun`, emails operators only when a check changes, purges audit > 90 days, see `plataforma.md` → "Platform API and remote MCP" |
| `billing-tick` | 1 | 3 | Self-scheduled repeatable (hourly at :07): expired trials/grace, notices and the 60-day purge, see `billing.md` → "Tick" |
| `inbox` | 1 | 1 | Bandeja (`lib/workers/inbox-worker.ts`, enruta por `job.name`): `tick` repetible (`5,20,35,50 * * * *`) = auto-resolver (`lib/inbox/auto-resolve.ts`); `away-message` (aviso fuera de horario, `lib/inbox/away-message.ts`); `transcribe` (nota de voz entrante con `autoTranscribeAudio`, encolado por `media-worker` al guardar el audio, `lib/ai/transcribe.ts`). Sin reintentos de BullMQ: cada job es idempotente y reintentar un envío podría duplicar el mensaje |

- `media-cleanup-worker.ts:processMediaCleanupJob()` deletes `WAMessage.mediaUrl` **and `ChannelMessage.mediaUrl`** files (the latter since 2026-09-16 — Telegram/Messenger/Instagram media used to grow unbounded) older than `MEDIA_RETENTION_DAYS` (env var, default 90) and clears the column, keeping the `media_data` volume bounded. No-ops if `MEDIA_RETENTION_DAYS <= 0`.
- **Bot reply humanization** (`WABot.humanizeEnabled`, opt-in, default `false`): when on, `bot-worker.ts` splits the reply on blank lines (`lib/whatsapp/humanize.ts:splitReply()`) and enqueues each chunk on `bot-message-send` with a cumulative simulated-typing delay (`computeTypingDelay()`, ~40ms/char, capped 0.8–8s) instead of calling `sendWhatsAppMessage()` synchronously — keeps the main `bot-messages` job from holding its concurrency slot for the whole send sequence. `bot-send-worker.ts:processBotSendJob()` re-fetches the `WAAccount` and does the actual send + `WAMessage`/`WAChat` bookkeeping per chunk. Tone/pacing only — never use this to imply the chat isn't automated (WhatsApp's Business Messaging Policy expects disclosure where applicable).
- **Bot reply rules** (`lib/bots/guards.ts`, shared by the 3 bot workers — WhatsApp, Telegram/Web, Messenger/Instagram), added 2026-09-16:
  - **One active bot per account.** `POST /api/whatsapp/bots/[id]/toggle` and `PATCH /api/whatsapp/bots/[id]` (moving an active bot) return 409 if the account already has another active bot (`findOtherActiveBot()`); ingest picks a single bot (`findFirst`, newest `updatedAt`) so accounts that already had several don't send N replies.
  - **Debounce:** ingest enqueues the bot job with `delay: BOT_REPLY_DEBOUNCE_MS` (4s); the worker skips the job if a newer INBOUND message exists in the chat (`getBotSkipReason()`) — the newest message's job replies with the earlier ones already in its history.
  - **Human takeover:** `lib/bots/guards.ts:getBotControlState()` is shared by the workers and the inbox mode indicator (`ChatBotMode`, `GET /api/whatsapp/chats/[chatId]/bot-mode`). A human OUTBOUND (`senderId != null`) pauses the bot for `BOT_HUMAN_TAKEOVER_MINUTES` (30); `POST` on the same route records `WAChat.botResumedAt` or `Conversation.botResumedAt` so the next lead message can reach the bot immediately. A later manual reply starts a new pause. Active conversational automations and their 24-hour handoff take precedence and cannot be bypassed by that POST. A skipped incoming message is never replayed automatically after resuming.
  - **No duplicate replies on retry:** once the reply is delivered (first humanized chunk enqueued or direct send done), later errors (persisting the message, appointment, summary) are logged but not rethrown — rethrowing made BullMQ retry the whole job and resend. AI usage is recorded right after the AI call (`lib/bots/usage.ts:recordBotUsage()`), before sending, so a failed send + retry still shows in the organization's AI cost (the credit itself was already reserved before the AI call, see "AI providers").
  - An empty model reply is never sent; if the WhatsApp model answered with only the ```appointment block, a fixed confirmation (`APPOINTMENT_ONLY_REPLY`) is sent instead.
- Workers live in `lib/workers/`. Queue definitions in `lib/queue.ts`.
- `REDIS_URL` env var required.
- `defaultJobOptions` include `attempts: 3`, `backoff: exponential`, `removeOnComplete: 100`, `removeOnFail: 50`.
- Workers have graceful shutdown on `SIGTERM`/`SIGINT`.
- `lib/redis.ts` exports `getRedisClient()` — singleton with retry strategy. Use this, not new connections.
- `lib/rate-limit.ts` — sliding-window rate limiter with Redis + in-memory fallback (fail-safe). Add to any new auth-sensitive endpoint.
