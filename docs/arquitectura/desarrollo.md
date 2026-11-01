# Desarrollo y despliegue

> Detalle técnico movido desde `AGENTS.md` (2026-11-01). Las reglas esenciales siguen en [`AGENTS.md`](../../AGENTS.md) y [`CLAUDE.md`](../../CLAUDE.md); aquí está el detalle completo. Mantén este archivo al día en el mismo cambio que el código.

## Development

Everything runs in containers (`docker compose`; the dev server `ludaisca` runs rootful Docker, see CLAUDE.md → "Commands" — the `:z` on bind mounts is a harmless leftover from the old Podman/SELinux host). Never install dependencies or databases on the host.

```bash
docker compose up --build   # dev server + postgres + redis, hot reload, port 15100
docker compose down -v      # full teardown including volumes
npx tsc --noEmit            # type check
# production build check: see CLAUDE.md → "Production build check" (builder stage; `npm run build` in the dev container fails)
npx prisma generate         # after schema changes
```

- **docker-compose.yml** is production (used by Coolify). **docker-compose.override.yml** adds dev overrides (volumes, hot reload, env_file). Docker Compose merges both locally.
- `tailwindcss` and `@tailwindcss/postcss` are in `dependencies` (not devDependencies) — required at build time even with `NODE_ENV=production`.
- `public/` must contain `.gitkeep` — Docker BuildKit fails on `COPY` of empty directories.
- Named volume `media_data` mounted at `/app/media` (in both compose files) stores downloaded WhatsApp media binaries. `MEDIA_ROOT` env var defaults to `/app/media`; helpers in `lib/whatsapp/media-store.ts` resolve paths thoroughfully. `media/.gitkeep` exists on host for git tracking.
- **Production env is an explicit passthrough list** in `docker-compose.yml` (`app.environment`): a variable set in Coolify that isn't listed there never reaches Node. Only infrastructure bootstrap vars are listed: `APP_URL` (public URL for email/Stripe links — read at runtime; `NEXT_PUBLIC_APP_URL` is baked at build and isn't passed, so it can't be used for that), `PLATFORM_ADMIN_EMAILS` (who sees `/plataforma` — deliberately kept out of the database, see "Platform operator panel"), `LANDING_WEBCHAT_ACCOUNT_ID`, `MEDIA_RETENTION_DAYS`, the Google Sheets OAuth trio. **SMTP, Stripe, the platform's AI keys, Turnstile and the measurement ids are NOT env vars** — they're `PlatformSettings` rows (`lib/platform-settings.ts`), edited from `/plataforma` → "Configuración" and encrypted at rest with `lib/crypto.ts`. Add any new *infrastructure* env var to this list (and to `.env.example`); add any new *business* setting to `PlatformSettings` instead.
- Production `app` service uses `expose: 5000` (no fixed host port bind). Coolify's own proxy (Traefik) routes to it via the FQDN/domain configured in the Coolify UI. Do **not** add a hardcoded `ports:` mapping back to `docker-compose.yml` — a fixed host port causes `port is already allocated` failures on redeploy if a stale container from a previous deploy attempt (or another app) still holds that port on the server.

## Índices de búsqueda en mensajes (runbook, 2026-11-01)

La búsqueda "En mensajes" (`lib/search/messages.ts`) usa dos índices GIN trigram sobre una expresión (`body` + `caption` + `transcript`). Viven en `prisma/sql/ensure-search-indexes.sql`, que `scripts/db-migrate.sh` corre en cada arranque después de `migrate deploy`. Ese script **solo los crea si la tabla tiene menos de 200 000 filas estimadas**: en una tabla grande, un `CREATE INDEX` normal bloquea las escrituras mientras se construye y el healthcheck de Coolify podría tumbar el deploy. Por encima de ese tamaño solo emite un `WARNING` en el log y el doctor de `/plataforma` marca `db.search` en amarillo.

Antes del primer deploy que incluye la búsqueda, en producción:

1. Medir: `SELECT relname, reltuples::bigint FROM pg_class WHERE relname IN ('wa_messages', 'channel_messages');`
2. Si alguna pasa de 200 000, crear su índice a mano desde `psql`, **una sentencia a la vez** (`CONCURRENTLY` no puede ir dentro de una transacción ni de un script con varias sentencias):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_search_trgm ON wa_messages
     USING gin ((coalesce(body, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(transcript, '')) gin_trgm_ops);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channel_messages_search_trgm ON channel_messages
     USING gin ((coalesce(body, '') || ' ' || coalesce(caption, '') || ' ' || coalesce(transcript, '')) gin_trgm_ops);
   ```
   La migración `voice_transcripts` (columna `transcript`) tiene que estar aplicada antes. Un `CONCURRENTLY` que falla deja un índice `INVALID`: bórralo con `DROP INDEX CONCURRENTLY` y repite.
3. Comprobar: `SELECT indexname FROM pg_indexes WHERE indexname LIKE '%search_trgm';` y el doctor de `/plataforma`.

La expresión del índice y la de `SEARCH_EXPR` en `lib/search/messages.ts` deben ser idénticas: si cambia una, cambia la otra, o Postgres vuelve al scan completo (comprobar con `EXPLAIN`).

