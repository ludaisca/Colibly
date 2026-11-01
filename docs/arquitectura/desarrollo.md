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
