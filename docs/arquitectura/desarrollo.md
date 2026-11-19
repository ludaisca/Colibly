# Desarrollo y despliegue

> Detalle técnico movido desde `AGENTS.md` (2026-11-01). Las reglas esenciales siguen en [`AGENTS.md`](../../AGENTS.md) y [`CLAUDE.md`](../../CLAUDE.md); aquí está el detalle completo. Mantén este archivo al día en el mismo cambio que el código.

## Development

Everything runs in containers (`docker compose`; the dev server `ludaisca` runs rootful Docker, see CLAUDE.md → "Commands" — the `:z` on bind mounts is a harmless leftover from the old Podman/SELinux host). Never install dependencies or databases on the host.

```bash
docker compose up --build   # dev server + postgres + redis + gowa (WhatsApp por QR, sin puerto), hot reload, port 1100
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

## Servicios de producción: `app` y `worker` (2026-11-19)

`docker-compose.yml` levanta la misma imagen dos veces: `app` (HTTP, dominio, migraciones; `COLIBLY_WORKERS=0`) y `worker` (las 26 colas; `COLIBLY_WORKERS=1`, `COLIBLY_SKIP_MIGRATIONS=1`, sin dominio, arranca cuando `app` está sano y monta `media_data` porque escribe medios). Comparten el entorno con un ancla YAML (`&app-environment`): **una variable nueva va en la lista de `app` y el worker la hereda**. En dev el override pone `COLIBLY_WORKERS=1` en `app` y deja `worker` fuera (perfil `prod-worker`). Probado con la imagen `runner` el 2026-11-19: app ~114 MB y worker ~135 MB.

**Imagen en CI:** el job `image` de `.github/workflows/ci.yml` publica la etapa `runner` en `ghcr.io/ludaisca/colibly:{sha,main}` en cada push a main (con `APP_URL`/`SITE_URL` como build args: quedan fijas en las páginas prerenderizadas). Coolify **todavía construye** desde el repo; pasar a la imagen requiere (1) acceso del servidor a GHCR (paquete público o `docker login ghcr.io` con un token de solo lectura en el servidor) y (2) cambiar `build:` por `image: ghcr.io/ludaisca/colibly:${COLIBLY_IMAGE_TAG:-main}` en `app` y `worker`, desplegando solo cuando el job terminó.

## Puertos del servidor de desarrollo (convención, 2026-11-03)

El servidor `ludaisca` comparte Docker entre proyectos. Cada proyecto tiene un bloque de puertos locales y uno de `tailscale serve`; el puerto de serve es el local con un `0` delante (`1100` → `10100`).

| Proyecto | Bloque local | Bloque serve (HTTPS, tailnet) |
|---|---|---|
| Colibly (incluye bench y auxiliares) | 1000-1999 | 10000-10999 |
| Factzi | 2000-2999 | 20000-20999 |
| Tesela | 3000-3999 | 30000-30999 |

Dentro de cada bloque (`x` = dígito del proyecto): `x100` app principal · `x101-x199` auxiliares de la app (mailpit…) · `x200-x299` benchmark y experimentos · `x900-x999` previews temporales. Los demás rangos quedan libres; no asignar fuera de esas centenas (el rango `x000-x099` toca puertos privilegiados y conocidos).

Colibly hoy: app `1100` (serve `10100`), Mailpit `1101` (serve `10101`), bench Chatwoot/Twenty/Mailpit `1200`/`1201`/`1202` (solo local), stack `colibly-coex` `1900`.

- Docker publica **siempre en `127.0.0.1`** (`docker-compose.data.yml`, no versionado). La única entrada remota es `tailscale serve`, con HTTPS: `ludaisca:<puerto>` directo nunca responde.
- Acceso remoto: `https://ludaisca.taila2291d.ts.net:10100`. Las URLs de `.env` (`AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `SITE_URL`, `GOOGLE_OAUTH_REDIRECT_URI`) usan ese puerto de serve.
- Serve: `sudo tailscale serve --bg --https=10100 http://127.0.0.1:1100`. **No usar** el 10000 exacto, ni 443 / 8443: son los únicos puertos que Tailscale permite abrir como Funnel (público). Funnel solo se enciende a mano y por poco tiempo.
- Un quinto proyecto exige revisar el esquema: sus puertos locales chocarían con servicios comunes (5000, 5432, 6379, 8080, 9000) y su serve (≥ 50000) con el rango efímero de Linux (32768-60999).

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


## Caída durante el deploy (QA-007, 2026-11-18)

Coolify despliega este proyecto como Docker Compose: recrea el contenedor `app` en cada deploy (no hay despliegue escalonado con dos réplicas), así que mientras el contenedor nuevo arranca nadie atiende y Traefik responde 502/503 o tarda. El arranque (`scripts/startup.sh`) es solo `migrate deploy` + `next start`; ya no corre `prisma generate`, porque el cliente viene generado en la imagen y eso sumaba ~4 s de caída. Medido con la imagen `runner` contra una base nueva: Next queda listo en menos de 1 s después de las migraciones. Lo que queda de caída depende de las migraciones de ese deploy y de que Coolify cambie el contenedor; quitarla del todo pediría desplegar como imagen con despliegue escalonado en vez de Compose. Desplegar en horario de poco tráfico.
