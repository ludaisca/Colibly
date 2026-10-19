# Límites de la API pública y webhooks — 2026-10-19

Cambios aplicados en DEV (rama `feat/lanzamiento-pulido`) tras la revisión de
capacidad y la comparación con Chatwoot. Todos los números viven en
`lib/api/constants.ts` (fuente única de código, OpenAPI y `/docs/api`) y se
pueden ajustar por env var (entero > 0; vacío = valor por defecto).

## Límites de velocidad (Redis, compartidos entre instancias)

| Capa | Default | Env var | Código |
|---|---|---|---|
| Por IP, con o sin key | 3000/min | `API_RATE_LIMIT_PER_IP` | `lib/api/auth.ts` |
| Por key | 120/min | `API_RATE_LIMIT_PER_KEY` | `lib/api/auth.ts` |
| Por organización (todas sus keys) | 600/min | `API_RATE_LIMIT_PER_ORG` | `lib/api/auth.ts` |
| `POST /messages` por organización | 60/min | `API_RATE_LIMIT_SEND_PER_ORG` | `app/api/v1/messages/route.ts` |
| `POST /messages` cupo diario (día UTC) | 10 000/día | `API_DAILY_SEND_CAP_PER_ORG` | `lib/rate-limit.ts` (`consumeDailyQuota`) |
| `GET /conversations` por key | 60/min | `API_RATE_LIMIT_CONVERSATIONS_PER_KEY` | `app/api/v1/conversations/route.ts` |
| Keys inválidas por IP | 30/min | — | `lib/api/auth.ts` |

- Ventana deslizante de 60 s (sorted set). Cuentan también los rechazados.
- 429 `rate_limited` (o `daily_limit_reached` para el cupo diario) con
  `X-RateLimit-Limit/Remaining/Reset`, `Retry-After` y el header nuevo
  `X-RateLimit-Scope` (`key|organization|ip|endpoint|daily`). En respuestas OK
  los headers informan el límite más ajustado.
- Un envío que no sale (error de validación del destino, Meta rechaza) devuelve
  su lugar del cupo diario.
- **Fail-closed**: si Redis no responde (1 s de tope; ioredis con
  `maxRetriesPerRequest: null` colgaba la solicitud), `/api/v1` responde
  `503 service_unavailable` con `Retry-After: 5`. El resto de la app conserva el
  respaldo en memoria (ahora sí se activa: antes el comando quedaba encolado).
- Idempotency-Key: con Redis no listo se procesa sin idempotencia (antes podía
  colgarse) — luego el limitador responde 503, así que no se envía nada.

## Cuerpo máximo: 1 MB (`API_MAX_BODY_BYTES`)

- `proxy.ts` corta con 413 `payload_too_large` cualquier `/api/v1/*` con
  `Content-Length` mayor.
- `enforceBodyLimit` (`lib/api/respond.ts`, llamado por `withApiErrors` y
  `withIdempotency`) mide también cuerpos chunked sin `Content-Length`.

## Caché de autenticación (Redis, 60 s, `API_AUTH_CACHE_SECONDS`)

`lib/api/auth-cache.ts`: key + rol/estado del dueño + alcance resuelto
(`apicache:key:<hash>`) y acceso del plan (`apicache:org:<id>`). Invalidación
inmediata:

- revocar / renombrar / borrar key → `app/api/configuracion/api-keys/[id]/route.ts`
- cambio de rol o desactivación del usuario → `app/api/usuarios/route.ts`
- cambio de plan/estado (Stripe, tick, /plataforma, borrado de organización)
  → `invalidateOrgBilling` en `lib/billing/gates.ts`

Cambios en las cuentas compartidas con el dueño caducan solos en ≤ 60 s. Si
Redis falla, se lee de la base sin caché. Ahorra ~4-6 consultas por solicitud.

## Pool de Postgres

`lib/prisma.ts` agrega `connection_limit` (y `pool_timeout`) a `DATABASE_URL`
desde `DB_CONNECTION_LIMIT` / `DB_POOL_TIMEOUT` si la URL no los trae. Vacío =
default de Prisma (núcleos × 2 + 1 = 17 en ludaisca).

- DEV: `DB_CONNECTION_LIMIT=20`, `DB_POOL_TIMEOUT=10` en `.env` (respaldo fuera del repo:
  `~/colibly.env.bak-2026-10-19` en ludaisca), también `connection_limit=20` en el `DATABASE_URL`
  del host. El compose las pasa al contenedor.
- **Producción (NO aplicado)**: recomendado `DB_CONNECTION_LIMIT=20` y
  `DB_POOL_TIMEOUT=10` en Coolify. App + workers corren en el mismo proceso;
  con 1-2 réplicas quedan ≤ 40 conexiones, holgado frente a
  `max_connections=100`.

## Webhooks

- Worker: 20 entregas en paralelo (`WEBHOOK_WORKER_CONCURRENCY`, antes 5).
- Por endpoint: como mucho 2 a la vez (`WEBHOOK_PER_ENDPOINT_CONCURRENCY`),
  semáforo en Redis con TTL (`webhook-inflight:<id>`); un job sin lugar se
  reprograma 1-3 s después con `DelayedError` sin gastar intento.
- Headers nuevos (aditivos, el cuerpo y la firma no cambian):
  `X-Colibly-Event-Id`, `X-Colibly-Attempt`, `User-Agent: Colibly-Webhooks/1.0`.

## Comparación con Chatwoot (sobre de eventos)

Chatwoot manda `event` + el objeto plano en la raíz, sin id de evento, sin
firma HMAC estándar y sin reintentos documentados. El sobre de Colibly
(`id`, `type`, `occurredAt`, `account`, `contact`, `conversation`, `data`) ya
es más completo y está prometido en v1, así que **no se toca el cuerpo**. Solo
se agregaron headers. Se descartó agregar un alias `event` en el cuerpo: es
redundante con `type` y cambiaría lo firmado sin beneficio.
