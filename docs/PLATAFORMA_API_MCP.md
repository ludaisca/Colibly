# Plan: API de plataforma + MCP para operar Colibly en producción

- **Estado:** implementado (2026-10-30); ver "Estado de implementación"
- **Fecha:** 2026-10-29
- **Alcance:** operación de la plataforma (no API de clientes)
- **Relacionado:** `AGENTS.md` → "Platform operator panel", "Billing", "Platform backups"

## 0. Estado de implementación (2026-10-30)

Ya está en el código:

- **Fase 1:** doctor (`GET /api/plataforma/diagnostico`), pestaña **Operación** en `/plataforma`, `PlatformHealthRun` y tick diario `platform-health` con alertas solo por cambio.
- **Fase 2:** modelos de tokens/auditoría, creación y revocación de tokens, API `/api/plataforma/v1/*` para status, organizaciones, trial, créditos, billing, reconciliación de precios, rotación/prueba del webhook, auditoría, configuración y escritura de secretos; auditoría con retención de 90 días.
- **Fase 3:** MCP remoto en `/api/mcp` (Streamable HTTP), Bearer y OAuth 2.1 + PKCE + DCR, consentimiento de operador y las 15 tools (más `colibly_set_secret` si se habilita).

Pendiente de la superficie REST (hoy disponible por MCP/UI): suspender/reactivar, respaldos y prueba de SMTP. No hay pruebas E2E de navegador; sí unitarias y un E2E manual del flujo MCP/OAuth.

---

## 1. Problema

Hoy los ajustes de producción se hacen a mano desde `/plataforma` y desde el dashboard de Stripe. Eso ya costó tiempo real:

- El webhook secret de Stripe de producción estaba vacío y nadie lo notó: `POST /api/billing/webhook` respondía **503** y ningún evento de cobro se procesaba.
- El catálogo live se desalineó (precios viejos bajo las lookup keys canónicas) y se detectó por casualidad en un E2E de test.
- Un secret se pudo borrar desde la UI sin aviso (pasó en dev el 2026-10-29 a las 23:51).
- La rotación de la key live se hizo pegando la key en el chat.

No falta una API: `/api/plataforma` ya existe y cubre casi todo. Falta **verificación, auditoría y acceso programático acotado**.

## 2. Objetivos

1. Detectar en segundos que la configuración de producción está rota (webhook, precios, SMTP, respaldos, colas) sin probar a mano.
2. Permitir operaciones repetibles y auditadas desde un CLI o un agente, sin dar acceso a secretos ni a acciones destructivas.
3. Hacer que la reconciliación del catálogo de Stripe sea una operación idempotente con dry-run, no una receta manual.
4. Reducir el riesgo de que un agente con acceso a producción cause un cargo o un borrado.

## 3. No objetivos

- No es la API pública de clientes (`/api/v1`). Esa sigue con `ApiKey` por organización y no se toca.
- No se exponen secretos (`revelar`), ni borrado de organizaciones, ni reembolsos, ni cambios de `PLATFORM_ADMIN_EMAILS` por API.
- No se reemplaza el dashboard de Stripe: se usa para lo que Stripe ya hace mejor.
- No se automatiza el lanzamiento legal/Meta.

## 4. Principios

- **Lectura por defecto.** Todo token nace con `platform:read`; la escritura se concede por scope.
- **Nunca secretos por API.** Los valores solo se escriben desde la UI humana. La API reporta `has*`/estado, jamás el valor.
- **Dry-run primero.** Las operaciones que tocan Stripe calculan el diff y no aplican nada sin `confirm`.
- **Idempotencia.** Toda mutación acepta `Idempotency-Key`; la reconciliación usa claves deterministas.
- **Auditoría obligatoria.** Cada escritura deja fila en `PlatformAuditLog` con before/after redactado.
- **Fail-closed.** Si Redis o la BD no responden, la API de escritura responde 503; el doctor degrada con `status: "unknown"`, no inventa `ok`.
- **Separación de superficies.** Sesión humana (`requirePlatformAdmin`) y token máquina (`requirePlatformToken`) son caminos distintos y auditables por separado.

## 5. Arquitectura

```
┌────────────────────┐      ┌──────────────────────────────┐
│ /plataforma (UI)   │─────▶│ /api/plataforma/*  (sesión)  │
└────────────────────┘      │  requirePlatformAdmin()      │
                            └──────────────┬───────────────┘
                                           │
                            ┌──────────────▼───────────────┐
                            │ lib/platform/diagnostics.ts  │
                            │ lib/platform/audit.ts        │
                            │ lib/platform/catalog.ts      │
                            └──────────────┬───────────────┘
                                           │
┌────────────────────┐      ┌──────────────▼───────────────┐
│ CLI / MCP (HTTP)   │─────▶│ /api/plataforma/v1/* (token) │
└────────────────────┘      │  requirePlatformToken()      │
                            └──────────────────────────────┘
```

- La UI, el API v1 y el MCP comparten `lib/platform/ops.ts` y el resto de `lib/platform/*`; ningún camino duplica la lógica.
- El MCP corre en la misma app y llama a `ops.ts` directamente (no se hace fetch a su propio API). El API v1 existe para CLI, scripts y clientes HTTP.

---

## 6. Fase 0 — Prerrequisitos de lanzamiento (no es parte del API)

Antes de construir esto, cerrar los bloqueantes ya identificados. El doctor de la Fase 1 sirve para verificarlos, pero no los arregla solo:

| # | Pendiente | Criterio de cierre |
|---|---|---|
| 1 | Webhook secret de Stripe en producción | `POST /api/billing/webhook` sin firma responde **400**, no 503; evento de prueba procesado |
| 2 | Rotar la key live expuesta en el chat | Key vieja revocada en Stripe; nueva guardada en producción; checkout OK |
| 3 | Price IDs live en producción | 59/89/149 con `price_1UVHLUPH…`; checkout muestra los montos correctos |
| 4 | SMTP de producción | Correo de verificación real recibido |
| 5 | Turnstile secret | Registro con captcha validado |
| 6 | Push de `dev/bandeja-opencode` | 12 commits en `origin` |

**Salida:** producción puede cobrar y verificar correo. Sin esto, el API solo automatiza un sistema roto.

---

## 7. Fase 1 — Doctor read-only (L1)

### 7.1 Objetivo

Un endpoint y una pestaña que respondan "¿está sana la plataforma?" en < 2 s, sin secretos y sin efectos secundarios.

### 7.2 Módulo `lib/platform/diagnostics.ts`

Función orquestadora:

```ts
export type CheckStatus = "ok" | "warn" | "fail" | "unknown";

export interface DiagnosticCheck {
  id: string;                 // "billing.webhook"
  label: string;              // "Webhook de Stripe"
  status: CheckStatus;
  message: string;            // "El webhook secret no está configurado"
  hint?: string;              // "Pégalo en /plataforma → Configuración → Stripe"
  details?: Record<string, unknown>; // redactado, sin secretos
}

export interface DiagnosticsReport {
  status: CheckStatus;        // peor estado de todos
  checkedAt: string;
  live: boolean;              // si corrió verificaciones contra Stripe/SMTP
  checks: DiagnosticCheck[];
}

export async function getPlatformDiagnostics(opts: { live?: boolean }): Promise<DiagnosticsReport>;
```

Cada check es una función con adaptadores inyectables para poder probarla sin red:

```ts
type CheckFn = (deps: DiagnosticDeps) => Promise<DiagnosticCheck>;
```

### 7.3 Checks iniciales

| id | Qué verifica | Fuente | live |
|---|---|---|---|
| `app.url` | `APP_URL` presente, https en producción, sin localhost | env | no |
| `app.version` | commit/build desplegado si existe `APP_COMMIT` | env | no |
| `db.migrations` | migraciones sin terminar (`_prisma_migrations.finished_at IS NULL`) | SQL | no |
| `db.vector` | índice `idx_knowledge_embedding` existe | `pg_indexes` | no |
| `db.search` | índices trigram `idx_wa_messages_search_trgm` / `idx_channel_messages_search_trgm` existen | `pg_indexes` | no |
| `redis` | ping y colas críticas sin backlog anormal | Redis | no |
| `queues.repeatables` | jobs repetibles registrados (`billing-tick`, `media-cleanup`, `platform-backup`, `platform-health`) | BullMQ | no |
| `billing.key` | key configurada; reporta `mode: "test" \| "live"` (nunca el valor) | settings | no |
| `billing.prices` | cada plan resuelve y `priceMatchesPlan()` contra 59/89/149 | Stripe | sí |
| `billing.lookup` | lookup keys canónicas apuntan al mismo price que `/plataforma` | Stripe | sí |
| `billing.webhook` | `stripeWebhookSecret` presente; endpoint live existe, `enabled` y con la URL correcta | settings + Stripe | sí |
| `billing.events` | último `StripeEvent.processedAt` y eventos recientes con `pending_webhooks > 0` | BD + Stripe | sí |
| `email.smtp` | host/puerto/from configurados; `verify()` opcional | settings | sí |
| `turnstile` | site key y secret presentes; avisa si son las claves de prueba de Cloudflare en producción | settings | no |
| `ai.providers` | al menos una key; Google presente si hay RAG (embeddings) | settings | no |
| `backups` | `backupFreshness()` = `ok`; configuración completa; último error | BD | no |
| `security.env` | `ENCRYPTION_KEY` (64 hex), `AUTH_SECRET`, `PLATFORM_ADMIN_EMAILS` no vacíos (solo booleanos) | env | no |
| `security.seed` | usuarios `@sundaycrm.test` o seeds en producción | BD | no |

Reglas:

- Nunca devolver valores de secretos, ni longitud exacta, ni prefijo.
- `live: true` solo desde el botón "Revisar contra Stripe" o el token con scope `platform:read`; cachear 60 s para no golpear Stripe en cada carga.
- Si una fuente falla, el check es `unknown` con mensaje accionable, nunca `ok`.

### 7.4 Endpoints

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| `GET` | `/api/plataforma/diagnostico?live=1` | sesión operador | `Cache-Control: no-store`, rate limit 30/min por email |
| `GET` | `/api/plataforma/v1/status` | token `platform:read` | mismo reporte, `live=1` opcional |

Respuesta de error estable, reutilizando la forma de `/api/v1`:

```json
{ "error": { "code": "forbidden", "message": "..." } }
```

**Decisión 2026-10-30:** el doctor es **interno**. No hay variante pública ni resumen anónimo; `/api/health` y `/api/health/respaldos` siguen siendo los únicos endpoints públicos de estado.

### 7.5 UI

- Nueva pestaña **Diagnóstico** en `/plataforma` (`HeroTabs`: Organizaciones, Configuración, Respaldos, Diagnóstico).
- Cabecera con semáforo global y botón "Revisar ahora" (fuerza `live=1`).
- Lista de checks agrupada por área, con chip de estado, mensaje y hint.
- Los `fail` muestran un enlace directo a la sección que los corrige (`/plataforma?tab=configuracion`, Stripe dashboard, etc.).
- En la pestaña Organizaciones, una banda compacta arriba si el estado global no es `ok`.

### 7.6 Chequeo periódico y alertas

- Nueva cola `platform-health` (repeatable `0 14 * * *` = 08:00 America/Mexico_City) registrada en `lib/workers/index.ts`.
- Modelo `PlatformHealthRun`:

```prisma
model PlatformHealthRun {
  id         String    @id @default(cuid())
  startedAt  DateTime  @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")
  status     String    // ok | warn | fail | error
  checks     Json
  notifiedAt DateTime? @map("notified_at")
  error      String?
  @@index([startedAt])
}
```

- Solo notifica **cambios**: un check que pasa de `ok` a `fail`/`warn`, o que se recupera. Evita correo diario repetido.
- Destinatarios: `PLATFORM_ADMIN_EMAILS` (reutiliza `sendEmailSafely` y una plantilla nueva `platformHealthTemplate`).
- Retención: 90 días (limpieza en el mismo tick o en `media-cleanup`).

### 7.7 Pruebas

- `lib/platform/__tests__/diagnostics.test.ts` con adaptadores falsos: cada check en ok/warn/fail/unknown, y el agregado.
- Verificar que ningún `details` contenga valores de `PLATFORM_SECRET_FIELDS`.
- `backupFreshness` ya está probado; reutilizarlo, no duplicar.

### 7.8 Criterios de aceptación

- [ ] `GET /api/plataforma/diagnostico` responde en < 2 s sin `live` y < 8 s con `live`.
- [ ] Con el webhook secret vacío, el reporte marca `billing.webhook: fail` con el hint correcto.
- [ ] Con precios 99/199/349, marca `billing.prices: fail` por plan.
- [ ] La UI muestra el semáforo y los hints.
- [ ] El tick diario crea `PlatformHealthRun` y notifica solo cambios.
- [ ] `tsc`, `eslint` y tests unitarios en verde.

**Estimación:** 1.5–2 días.

---

## 8. Fase 2 — API de escritura con tokens (L2)

### 8.1 Modelo de datos

```prisma
model PlatformApiToken {
  id             String    @id @default(cuid())
  name           String
  prefix         String    // "plt_live_ab12" — visible en la lista
  tokenHash      String    @unique @map("token_hash")
  scopes         String[]  @default(["platform:read"])
  environment    String    // "dev" | "production" (etiqueta, no seguridad)
  allowedCidrs   String[]  @default([]) @map("allowed_cidrs") // vacío = cualquier IP; obligatorio para secret:write
  createdByEmail String    @map("created_by_email")
  lastUsedAt     DateTime? @map("last_used_at")
  expiresAt      DateTime? @map("expires_at")
  revokedAt      DateTime? @map("revoked_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([revokedAt])
}

model PlatformAuditLog {
  id          String   @id @default(cuid())
  actorType   String   // "user" | "token" | "system"
  actorEmail  String?  @map("actor_email")
  tokenId     String?  @map("token_id")
  action      String   // "org.extend_trial", "billing.prices.apply"
  targetType  String?  @map("target_type")
  targetId    String?  @map("target_id")
  before      Json?
  after       Json?
  ip          String?
  requestId   String?  @map("request_id")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([action])
  @@index([targetId])
}
```

Migración con `sh scripts/new-migration.sh platform_api_tokens`.

### 8.2 Formato y autenticación de tokens

- Formato: `plt_<env>_<32 bytes base64url>`; se muestra **una sola vez** al crearlo.
- Se guarda `hashToken(token)` (sha256, ya existe en `lib/crypto.ts`).
- `prefix` = primeros 12 caracteres visibles.
- Scopes:
  - `platform:read` — status, organizaciones, billing, respaldos, auditoría.
  - `org:write` — trial, créditos, suspender/reactivar.
  - `billing:write` — reconciliar precios, rotar webhook.
  - `backup:write` — correr/probar respaldo.
  - `mail:test` — probar SMTP.
  - `secret:write` — escribir secretos en `PlatformSettings` (reglas duras en 8.10).
- Por defecto: solo `platform:read`. La UI exige marcar scopes explícitamente.
- Expiración por defecto: 90 días; máximo 365. Revocable en cualquier momento.
- `lastUsedAt` con resolución de 60 s (misma idea que `ApiKey`).

Helper `lib/platform/tokens.ts`:

```ts
export interface PlatformTokenContext {
  tokenId: string;
  scopes: string[];
  actorEmail: string;
  environment: string;
}

export async function requirePlatformToken(
  req: Request,
  scope: string
): Promise<PlatformTokenContext | NextResponse>;
```

Reglas:

- `Authorization: Bearer plt_...`.
- 401 si falta/es inválido/revocado/expirado; 403 si el scope no alcanza.
- Rate limit: 60/min por token y 300/min por IP; fail-closed si Redis no responde.
- Log de intentos fallidos (sin token) para detectar fuga.

### 8.3 Auditoría

`lib/platform/audit.ts`:

```ts
export async function logPlatformAction(input: {
  actor: { type: "user" | "token" | "system"; email?: string | null; tokenId?: string | null };
  action: string;
  target?: { type: string; id: string };
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
}): Promise<void>;
```

- Redacta cualquier campo de `PLATFORM_SECRET_FIELDS` como `"[set]"`, `"[cleared]"` o `"[unchanged]"`.
- Nunca lanza: si falla el log, se escribe en consola y la operación sigue (el log es observabilidad, no consistencia).
- Se aplica también a las rutas humanas existentes: `PATCH /api/plataforma/configuracion`, `PATCH /api/plataforma/organizaciones/[id]`, `POST /api/plataforma/respaldos`.
- **Retención: 90 días (trimestral, decisión 2026-10-29).** Purga diaria dentro del tick de `platform-health`; si se necesita evidencia más antigua, exportar antes del corte. Constante `PLATFORM_AUDIT_RETENTION_DAYS = 90` para no dispersar el número.

### 8.4 Endpoints v1

Namespace separado para no mezclar sesión y token: `/api/plataforma/v1/*`.

| Método | Ruta | Scope | Cuerpo / notas |
|---|---|---|---|
| `GET` | `/status` | `platform:read` | Reporte del doctor (`live=1` opcional) |
| `GET` | `/organizaciones` | `platform:read` | `?q=&estado=&pagina=`; mismos filtros que la UI |
| `GET` | `/organizaciones/{id}` | `platform:read` | Detalle + billing + uso |
| `POST` | `/organizaciones/{id}/trial` | `org:write` | `{ days, confirm }`; mismas reglas de `extendTrial()` |
| `POST` | `/organizaciones/{id}/creditos` | `org:write` | `{ credits, confirm }`; tope 100,000 |
| `POST` | `/organizaciones/{id}/suspender` | `org:write` | `{ confirm: "<nombre exacto>" }` |
| `POST` | `/organizaciones/{id}/reactivar` | `org:write` | `{ confirm }`; re-sincroniza Stripe si hay suscripción |
| `GET` | `/billing` | `platform:read` | Modo test/live, precios resueltos, webhook, últimos eventos |
| `POST` | `/billing/verificar` | `platform:read` | Fuerza verificación live contra Stripe |
| `POST` | `/billing/precios/sincronizar` | `billing:write` | `{ dryRun: true \| false, confirm: "APLICAR" }` |
| `POST` | `/billing/webhook/rotar` | `billing:write` | `{ confirm: "ROTAR" }`; devuelve endpoint id, nunca el secret |
| `GET` | `/respaldos` | `platform:read` | Estado + últimas corridas |
| `POST` | `/respaldos/run` | `backup:write` | Encola corrida manual |
| `POST` | `/respaldos/test` | `backup:write` | Prueba bucket |
| `POST` | `/smtp/test` | `mail:test` | `{ to }`; envía correo de prueba |
| `GET` | `/auditoria` | `platform:read` | `?action=&targetId=&desde=&hasta=&pagina=` |
| `GET` | `/configuracion` | `platform:read` | Solo indicadores `has*`; nunca valores |
| `PUT` | `/configuracion/secretos/{field}` | `secret:write` | `{ value, confirm: "<field>" }`; reglas en 8.10 |

**Decisión 2026-10-29:** suspender y reactivar **sí** se exponen por token, con `org:write` y confirmación por nombre exacto de la organización. Suspender cierra sesiones en la siguiente revalidación (~60 s), así que la confirmación es obligatoria.

**No expuesto:** `revelar`, borrado de organización, reembolsos, `PLATFORM_ADMIN_EMAILS`, escritura de secretos.

Convenciones:

- Validación con Zod, igual que las rutas actuales.
- Respuesta OK: `{ ok: true, data: ... }`; error: `{ error: { code, message } }`.
- `Idempotency-Key` en todas las mutaciones; se guarda en `PlatformAuditLog.requestId` y se rechaza repetir con 409 si el cuerpo difiere.
- Rate limit por token y por endpoint.

### 8.5 Reconciliación de precios

Módulo `lib/platform/catalog.ts`, con una parte pura y una de ejecución:

```ts
export interface CatalogPlan {
  createProducts: { plan: PlanId; name: string }[];
  createPrices: { plan: PlanId; productId: string; amount: number; lookupKey: string }[];
  transferLookup: { plan: PlanId; priceId: string; lookupKey: string }[];
  renameProducts: { productId: string; name: string }[];
  archivePrices: { priceId: string; reason: string }[];
}

export function diffCatalog(input: {
  plans: typeof PLANS;
  lookupKeys: typeof PLAN_LOOKUP_KEYS;
  products: Stripe.Product[];
  prices: Stripe.Price[];
}): CatalogPlan;
```

Ejecución (`applyCatalogPlan`):

1. Crear producto si falta (`metadata.colibly_plan`).
2. Crear precio si falta (MXN, mensual, `metadata.colibly_plan`).
3. Transferir lookup key al precio correcto con `transfer_lookup_key: true`.
4. Renombrar productos a `Colibly Básico/Avanzado/Pro`.
5. Archivar precios viejos solo si no son el precio vigente y no tienen lookup key canónica.
6. Devolver `{ dryRun, before, after, applied[] }`.

Reglas de seguridad:

- `dryRun: true` por defecto; aplicar exige `confirm: "APLICAR"`.
- Idempotencia determinista: `colibly-catalog-<plan>-<amount>-<lookup>`.
- Nunca archivar un precio que sea el resuelto actual de un plan.
- Refuses si el modo de la key no coincide con `environment` del token (evita test contra live por error).
- Después de aplicar: invalidar `priceCache` y `platformSettings` cache; correr `billing.prices` del doctor y devolver el resultado.

### 8.6 Rotación del webhook

`lib/platform/webhook-rotate.ts`:

1. Listar endpoints de Stripe; localizar el que apunta a `APP_URL + /api/billing/webhook`.
2. Crear un endpoint nuevo con los mismos eventos (Stripe devuelve `secret` una vez).
3. Guardar `stripeWebhookSecret` cifrado y invalidar caches.
4. Borrar el endpoint viejo **después** de que el nuevo esté guardado.
5. Devolver `{ endpointId, url, events }`; el secret nunca se devuelve.
6. Si algo falla a mitad, no borrar el viejo (rollback lógico: restaurar el secret anterior).

Verificación end-to-end sin depender de Stripe:

- `POST /billing/webhook/probar` (o `action: "test"`): construye un evento sintético `colibly.ping`, lo firma con el secret guardado y hace `POST` a `APP_URL/api/billing/webhook`.
- El handler ignora tipos desconocidos pero valida la firma y responde 200.
- Resultado: `{ ok: true, status: 200 }` o el error exacto. Esto habría detectado el 503 de hoy en un clic.

### 8.7 UI

- **Tokens:** dentro de Configuración → sección "Acceso por API" (mismo patrón que `_respaldos.tsx`):
  - tabla con nombre, prefijo, scopes, entorno, último uso, expiración, estado;
  - "Crear token" (modal, scopes con checkboxes, secreto mostrado una vez con botón Copiar);
  - "Revocar" con confirmación.
- **Auditoría:** dentro de la pestaña Diagnóstico, tabla paginada de últimos 50 movimientos con filtros por acción y organización.
- **Doctor:** descrito en Fase 1.

### 8.8 Pruebas

- `tokens.test.ts`: hash, scopes, expiración, revocación, 401/403, rate limit.
- `audit.test.ts`: redacción de secretos, before/after.
- `catalog.test.ts`: diff con catálogo correcto, con precios viejos, con lookup key duplicada, con producto faltante; ejecución dry-run no llama a Stripe.
- `webhook-rotate.test.ts`: orden de operaciones y rollback si falla el guardado.
- Manual E2E contra Stripe test: crear precio viejo a propósito, correr dry-run, aplicar, verificar checkout en 59/89/149.

### 8.9 Criterios de aceptación

- [ ] Se puede crear un token read-only y consultar `/status` con `curl`.
- [ ] Un token sin `billing:write` recibe 403 en reconciliación.
- [ ] La reconciliación en dry-run no modifica Stripe.
- [ ] Aplicar deja el catálogo en 59/89/149 y el doctor en `ok`.
- [ ] Rotar el webhook deja el endpoint nuevo activo y el viejo borrado.
- [ ] `POST /billing/webhook/probar` devuelve 200 con firma válida y 400 si se altera el secret.
- [ ] Toda mutación deja fila en `PlatformAuditLog` sin secretos.
- [ ] Revocar un token corta el acceso en < 60 s.
- [ ] Escribir un secreto con `secret:write` responde solo `{ hasValue: true }`, nunca el valor.
- [ ] Un token sin allowlist de IP no puede usar `secret:write`.
- [ ] Un `sk_live_` enviado con token de entorno `dev` se rechaza sin guardar.
- [ ] La auditoría del secreto queda como `[set]`, sin el valor.

**Estimación:** 3–4 días.

### 8.10 Escritura de secretos por API (`secret:write`)

Decisión 2026-10-30: **sí se permite**, con candados más estrictos que el resto de la API.

- Endpoint: `PUT /api/plataforma/v1/configuracion/secretos/{field}`.
- `field` limitado a los 12 de `PLATFORM_SECRET_FIELDS`; cualquier otro → 400.
- Cuerpo: `{ value, confirm: "<field>" }`; `value` de 1–500 caracteres, sin `trim` (un secreto puede tener espacios).
- Candados:
  - scope `secret:write`;
  - `expiresAt` a **≤ 24 h** desde ahora;
  - `allowedCidrs` **no vacío** (aquí la allowlist es obligatoria aunque en el resto sea opcional);
  - `environment` coherente con el valor: `sk_live_…` exige `production`, `sk_test_…` exige `dev`; si no coincide, se rechaza **antes** de guardar;
  - rate limit 5/h por token y 20/día por operador;
  - cuerpo máximo 8 KB y rechazo de campos extra.
- Escritura: validar → cifrar con `lib/crypto` → `updatePlatformSettings()` solo de esa columna → invalidar caché de settings (y `priceCache` si es `stripeSecretKey`) → auditar `config.secret.set` con `before/after: "[set]"` → correo a `PLATFORM_ADMIN_EMAILS` con el nombre del campo, nunca el valor.
- Lectura: `GET /configuracion` devuelve solo `has<Field>`; **no** existe `revelar` por API.
- Post-escritura: si es `stripeWebhookSecret`, correr `POST /billing/webhook/probar`; si es `stripeSecretKey`, correr `POST /billing/verificar`.
- El MCP **no** expone esta tool por defecto (ver 9.4): el valor entraría al contexto del modelo. Para rotaciones se recomienda `curl` con el secreto por `stdin` o la UI.

---

## 9. Fase 3 — MCP remoto con OAuth (L3)

### 9.1 Forma

- Servidor **remoto** con transporte **Streamable HTTP** (MCP spec 2025-03-26), en `https://app.colibly.com/api/mcp`.
- Sin estado (`sessionIdGenerator: undefined`): cada request lleva su token; escala horizontal sin sesiones en Redis.
- Vive en la misma app: `lib/mcp/` + `app/api/mcp/route.ts`. Reutiliza los servicios de `lib/platform/*` y el modelo de tokens de la Fase 2. No hay paquete aparte ni contenedor extra.
- Dependencia `@modelcontextprotocol/sdk` en `dependencies`; route handler con `WebStandardStreamableHTTPServerTransport` (o el adapter de Next equivalente).
- El route handler declara `runtime = "nodejs"` y `dynamic = "force-dynamic"` (usa Prisma/Redis, no se prerenderiza).
- `proxy.ts` debe dejar pasar `/api/mcp` y `/.well-known/*` sin sesión ni gate de facturación (lista blanca explícita), igual que `/api/v1`.
- Alternativa descartada para v1: contenedor separado. Duplica auth, despliegue y observabilidad sin beneficio a esta escala.

### 9.2 Autenticación: dos caminos

**a) Bearer `plt_...`** — para CLI, scripts y clientes que aceptan headers.

- Mismos tokens y scopes de la Fase 2.
- Expiración máxima 30 días, `environment` obligatorio, revocación inmediata.
- Allowlist opcional (`PlatformApiToken.allowedCidrs`); vacía = cualquier IP.
- Rate limit 30 req/min por token y 120/min por IP; fail-closed sin Redis.
- Intentos fallidos: log sin token y alerta si superan 10/min desde una IP.

**b) OAuth 2.1 + PKCE + DCR** — decisión 2026-10-30: se implementa **ahora**, no como fase posterior.

- Flujo: el cliente descubre metadata → se registra (DCR) → `authorize` con PKCE S256 → el operador inicia sesión y consiente → `code` → `token`.
- Access token opaco `poa_...` con TTL **1 h**; refresh `por_...` con TTL **30 días** y **rotación** en cada uso.
- Reuse detection: si se reutiliza un refresh ya consumido, se revoca toda la familia y se alerta.
- `resource` obligatorio (RFC 8707) y ligado a `https://app.colibly.com/api/mcp`; un token de otro resource se rechaza.
- El consentimiento exige sesión NextAuth y correo en `PLATFORM_ADMIN_EMAILS`. Un cliente DCR no obtiene nada sin que el operador apruebe.
- Discovery:
  - `GET /.well-known/oauth-protected-resource` → `{ resource, authorization_servers, scopes_supported }`.
  - `GET /.well-known/oauth-authorization-server` → endpoints, `code_challenge_methods_supported: ["S256"]`, `registration_endpoint`.
- En 401: `WWW-Authenticate: Bearer resource_metadata="https://app.colibly.com/.well-known/oauth-protected-resource"`.
- Scopes idénticos a los tokens (`platform:read`, `org:write`, `billing:write`, `backup:write`, `mail:test`, `secret:write`).

### 9.3 Modelo OAuth

```prisma
model PlatformOAuthClient {
  id           String   @id @default(cuid())
  clientId     String   @unique @map("client_id")
  clientName   String   @map("client_name")
  redirectUris String[] @map("redirect_uris")
  grantTypes   String[] @default(["authorization_code", "refresh_token"]) @map("grant_types")
  scopes       String[] @default([])
  createdAt    DateTime @default(now()) @map("created_at")
}

model PlatformOAuthCode {
  id                  String    @id @default(cuid())
  codeHash            String    @unique @map("code_hash")
  clientId            String    @map("client_id")
  redirectUri         String    @map("redirect_uri")
  scopes              String[]  @default([])
  operatorEmail       String    @map("operator_email")
  codeChallenge       String    @map("code_challenge")
  codeChallengeMethod String    @default("S256") @map("code_challenge_method")
  resource            String?
  expiresAt           DateTime  @map("expires_at")
  consumedAt          DateTime? @map("consumed_at")
  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([expiresAt])
}

model PlatformOAuthToken {
  id               String    @id @default(cuid())
  accessHash       String    @unique @map("access_hash")
  refreshHash      String?   @unique @map("refresh_hash")
  familyId         String    @map("family_id")
  clientId         String    @map("client_id")
  operatorEmail    String    @map("operator_email")
  scopes           String[]  @default([])
  resource         String?
  accessExpiresAt  DateTime  @map("access_expires_at")
  refreshExpiresAt DateTime? @map("refresh_expires_at")
  revokedAt        DateTime? @map("revoked_at")
  lastUsedAt       DateTime? @map("last_used_at")
  createdAt        DateTime  @default(now()) @map("created_at")

  @@index([clientId])
  @@index([familyId])
  @@index([revokedAt])
}
```

Reglas:

- Código de autorización: TTL 10 min, un solo uso, `redirect_uri` exacta y PKCE S256 obligatorio.
- DCR: rate limit 10/h por IP; `redirect_uris` solo `https` (se permite `localhost` en desarrollo); `token_endpoint_auth_method: "none"` (cliente público + PKCE).
- Revocación inmediata: los tokens son opacos y se consultan en BD, no JWT.
- `requirePlatformToken()` acepta ambos caminos: prefijo `plt_` → `PlatformApiToken`; prefijo `poa_` → `PlatformOAuthToken` vigente.

### 9.4 Herramientas

| Tool | Scope | Notas |
|---|---|---|
| `colibly_status` | read | Semáforo + checks |
| `colibly_billing_health` | read | Precios, webhook, modo de key |
| `colibly_list_organizations` | read | Búsqueda y filtro |
| `colibly_get_organization` | read | Detalle |
| `colibly_extend_trial` | org:write | `{ organizationId, days, confirm }` |
| `colibly_grant_credits` | org:write | `{ organizationId, credits, confirm }` |
| `colibly_suspend_organization` | org:write | `confirm` = nombre exacto; cierra sesiones |
| `colibly_reactivate_organization` | org:write | `{ organizationId, confirm }`; re-sincroniza Stripe si aplica |
| `colibly_reconcile_prices` | billing:write | `dryRun` por defecto; aplicar exige `confirm: "APLICAR"` |
| `colibly_rotate_webhook` | billing:write | `confirm: "ROTAR"` |
| `colibly_test_webhook` | billing:write | Auto-firma y verifica 200 |
| `colibly_run_backup` | backup:write | Encola |
| `colibly_test_smtp` | mail:test | `{ to }` |
| `colibly_set_secret` | secret:write | **Desactivada por defecto**; ver abajo |

`colibly_set_secret`:

- Solo se registra si `COLIBLY_MCP_ALLOW_SECRET_WRITE=1`.
- Documenta explícitamente que el valor del secreto **entra al contexto del modelo**; para rotaciones se recomienda `curl` con el secreto por `stdin` o la UI.
- Exige `confirm: "<field>"` y aplica los mismos candados de 8.10 (token ≤ 24 h, allowlist obligatoria, entorno coherente).

No hay tools de: revelar secretos, borrar organizaciones, reembolsar, cambiar `PLATFORM_ADMIN_EMAILS`.

### 9.5 Seguridad del servidor remoto

- HTTPS obligatorio; rechazar `http://` salvo `localhost` en desarrollo.
- Validar `Host` y `Origin`; sin CORS comodín.
- Límite de mensaje de 64 KB y timeout de 20 s por tool.
- El token se lee del header y se descarta; nunca se registra ni se devuelve.
- Toda tool de escritura deja `PlatformAuditLog` con `actorType: "token"`, `action: "mcp.<tool>"` y `requestId`.
- Errores sin stack traces ni detalles internos.
- El servidor no borra organizaciones; la superficie destructiva termina en suspender/reactivar con confirmación.
- OAuth: códigos y tokens hasheados; nunca se registran; el consentimiento se audita (`mcp.oauth.authorized`).

### 9.6 Distribución y configuración

- Endpoint único: `https://app.colibly.com/api/mcp`.
- Documentación en `docs/PLATAFORMA_MCP.md` con configuración por cliente.
- Ejemplo OpenCode con OAuth (el cliente descubre todo desde el endpoint):

```json
{
  "mcp": {
    "colibly": {
      "type": "remote",
      "url": "https://app.colibly.com/api/mcp",
      "enabled": true
    }
  }
}
```

- Ejemplo con bearer (CLI o cliente que acepta headers):

```json
{
  "mcp": {
    "colibly": {
      "type": "remote",
      "url": "https://app.colibly.com/api/mcp",
      "headers": { "Authorization": "Bearer plt_production_..." },
      "enabled": true
    }
  }
}
```

- El formato exacto depende del cliente; la doc incluye OpenCode, Claude Desktop y `curl` para el handshake y el flujo OAuth.

### 9.7 Pruebas

- `lib/mcp/__tests__/tools.test.ts`: registro de tools, scopes y confirmaciones.
- `lib/mcp/__tests__/transport.test.ts`: `initialize`, `tools/list`, `tools/call` contra el route handler con `fetch`.
- `lib/mcp/__tests__/auth.test.ts`: sin token 401, sin scope 403, revocado 401, allowlist.
- `lib/mcp/__tests__/oauth.test.ts`: DCR, authorize/consentimiento, PKCE incorrecto, código reutilizado, rotación de refresh, reuse detection, scope escalation, `resource` distinto.
- Manual: conectar desde OpenCode con OAuth, ejecutar `colibly_status` y un dry-run de precios.

### 9.8 Criterios de aceptación

- [ ] `POST /api/mcp` responde al handshake `initialize` con bearer válido y con OAuth.
- [ ] `/.well-known/oauth-protected-resource` y `/.well-known/oauth-authorization-server` publican la metadata correcta.
- [ ] El flujo OAuth completo funciona con PKCE S256 y consentimiento de un operador.
- [ ] Un código reutilizado o un PKCE incorrecto fallan.
- [ ] Reutilizar un refresh revoca la familia y alerta.
- [ ] `tools/list` devuelve las 13 tools (14 con secretos habilitados) y no expone secretos.
- [ ] Un token sin `billing:write` no puede ejecutar reconciliación (403).
- [ ] Suspender exige el nombre exacto y queda auditado; el acceso del usuario termina en < 60 s.
- [ ] Revocar el token corta el acceso en < 60 s.
- [ ] Rate limit y allowlist funcionan.
- [ ] Documentación probada desde OpenCode.

**Estimación:** 4–5 días (OAuth incluido).

---

## 10. Seguridad — checklist

- [ ] Tokens hasheados con sha256; el valor solo se muestra al crear.
- [ ] Prefijo visible para identificar, nunca el token completo.
- [ ] Scopes por mínimo privilegio; read-only por defecto.
- [ ] Expiración por defecto 90 días (API) y 30 días (MCP); revocación inmediata.
- [ ] Rate limit por token, por IP y por endpoint; fail-closed sin Redis.
- [ ] `Idempotency-Key` en mutaciones.
- [ ] Confirmación explícita en operaciones destructivas o de dinero.
- [ ] Dry-run obligatorio en reconciliación.
- [ ] Auditoría con redacción de secretos; retención 90 días.
- [ ] Sin `revelar` por API, sin borrado de organizaciones, sin reembolsos.
- [ ] MCP remoto: TLS, `Host`/`Origin` validados, sin CORS comodín.
- [ ] Límite de mensaje (64 KB) y timeout de 20 s por tool.
- [ ] OAuth 2.1: PKCE S256 obligatorio, códigos de 10 min y un solo uso, refresh con rotación y reuse detection.
- [ ] DCR rate-limited; redirect URIs `https`; consentimiento solo para operadores de `PLATFORM_ADMIN_EMAILS`.
- [ ] Tokens OAuth opacos, hasheados y revocables; nunca en logs.
- [ ] Alerta por intentos de token fallidos (más de 10/min desde una IP).
- [ ] Token distinto por entorno; el servidor rechaza operaciones live con token `dev`.
- [ ] `secret:write`: expiración ≤ 24 h, allowlist obligatoria, entorno coherente, 5/h, auditoría y correo al operador.
- [ ] `GET /configuracion` solo devuelve `has*`; ningún endpoint devuelve valores.
- [ ] Doctor solo para operadores (sin resumen público).
- [ ] `Cache-Control: no-store` en todas las respuestas.
- [ ] Revisión de que ningún `details` incluya valores de `PLATFORM_SECRET_FIELDS`.

---

## 11. Runbooks

### 11.1 Webhook de Stripe caído (503)

1. `GET /api/plataforma/v1/status?live=1` → `billing.webhook: fail`.
2. Si el campo está vacío: copiar el signing secret del endpoint en Stripe y pegarlo en `/plataforma` (humano).
3. Si el campo tiene valor pero falla: `POST /billing/webhook/rotar` con `confirm: "ROTAR"`.
4. `POST /billing/webhook/probar` → debe dar 200.
5. Reenviar el evento pendiente desde Stripe o esperar el reintento.

### 11.2 Precios desalineados

1. `GET /billing` → `billing.prices: fail` con el monto esperado vs real.
2. `POST /billing/precios/sincronizar { dryRun: true }` → revisar diff.
3. `POST ... { dryRun: false, confirm: "APLICAR" }`.
4. Repetir `GET /billing` → `ok`; abrir checkout de prueba.

### 11.3 Rotación de la key live

1. Crear la nueva key en Stripe (restricted si es posible).
2. Actualizarla en `/plataforma` (humano) **o** con `PUT /api/plataforma/v1/configuracion/secretos/stripeSecretKey` usando un token `secret:write` de ≤ 24 h y allowlist obligatoria.
3. Verificar `billing.key` → `mode: live`, `ok`.
4. Revocar la vieja en Stripe.
5. Guardar evidencia en la auditoría (acción `config.secret.set`, con el campo pero sin el valor).

### 11.4 Organización cancelada por error

1. `GET /organizaciones/{id}` → estado y `canceledAt`.
2. Si aplica: `POST /organizaciones/{id}/trial { days }` (sale de la purga) o reactivar suscripción en Stripe y `POST .../reactivar`.

---

## 12. Pruebas y calidad

- Unitarias: doctor, tokens, auditoría, diff de catálogo, rotación, self-test de webhook.
- Integración manual con Stripe test (mismo patrón del E2E del 2026-10-29).
- `npx tsc --noEmit`, `npx eslint`, `npm test` y build `builder` antes de cada fase.
- No se agregan tests E2E de navegador (Playwright no está instalado); las rutas se prueban con `curl` y tokens reales de test.

## 13. Despliegue y orden

1. Fase 0 (bloqueantes) — 1 día.
2. Fase 1 (doctor + alertas) — 1.5–2 días.
3. Push y despliegue; usar el doctor para verificar producción.
4. Fase 2 (tokens + API v1 + auditoría) — 3–4 días.
5. Fase 3 (MCP remoto + OAuth) — 4–5 días.

Total: ~2 semanas después de los bloqueantes (OAuth incluido). El MCP no bloquea el lanzamiento.

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un agente con `billing:write` rompe el checkout | Dry-run, confirmación, scope separado, auditoría, token de test por defecto |
| Fuga de token | Hash, prefijo, expiración, revocación, rate limit, logs de intentos |
| MCP remoto expuesto a internet | Token de 30 días máximo, allowlist opcional, rate limit estricto, alertas de intentos, sin secretos ni borrados |
| Cliente OAuth malicioso vía DCR | Consentimiento obligatorio del operador, PKCE, redirect URIs https, rate limit y auditoría |
| Refresh token robado y reutilizado | Rotación en cada uso; reuse detection revoca la familia y alerta |
| `secret:write` mal usado | Expiración ≤ 24 h, allowlist obligatoria, validación de entorno, 5/h, correo y auditoría |
| Secreto filtrado en el contexto del modelo vía MCP | Tool desactivada por defecto; se recomienda `curl`/UI para rotaciones |
| Reconciliación archiva un precio en uso | Regla explícita: nunca archivar el precio vigente; dry-run obligatorio |
| Rotación de webhook deja una ventana sin eventos | El handler es idempotente (`StripeEvent`); se borra el viejo después de guardar el nuevo |
| El doctor golpea Stripe y se vuelve lento | Cache 60 s; `live` solo bajo demanda o en el tick diario |
| Duplicar lógica con la UI | La UI y el API llaman a los mismos módulos (`lib/platform/*`) |

## 15. Decisiones cerradas

Todas las decisiones de diseño quedaron cerradas el **2026-10-30**:

1. La reconciliación de precios **siempre** exige `confirm`; no hay auto-aplicación.
2. El doctor es **interno**: solo `/api/plataforma/diagnostico` y la pestaña de `/plataforma`; sin resumen público. `/api/health` y `/api/health/respaldos` siguen como están.
3. La API **sí** puede escribir secretos, con scope `secret:write` y los candados de 8.10.
4. La allowlist de IP es **opcional** en general y **obligatoria** para `secret:write`.
5. OAuth 2.1 + PKCE + DCR se implementa **en la Fase 3**, no como fase posterior.

Cualquier cambio futuro a estas reglas se documenta aquí y en `AGENTS.md`.

## 16. Mapa de archivos

**Nuevos**

- `lib/platform/diagnostics.ts`
- `lib/platform/checks/*.ts` (una función por área)
- `lib/platform/tokens.ts`
- `lib/platform/audit.ts`
- `lib/platform/catalog.ts`
- `lib/platform/webhook-rotate.ts`
- `lib/platform/oauth.ts`
- `lib/platform/secret-write.ts`
- `lib/platform/__tests__/diagnostics.test.ts`
- `lib/platform/__tests__/tokens.test.ts`
- `lib/platform/__tests__/audit.test.ts`
- `lib/platform/__tests__/catalog.test.ts`
- `lib/platform/__tests__/oauth.test.ts`
- `lib/platform/__tests__/secret-write.test.ts`
- `app/api/plataforma/diagnostico/route.ts`
- `app/api/plataforma/tokens/route.ts`
- `app/api/plataforma/tokens/[id]/route.ts`
- `app/api/plataforma/v1/status/route.ts`
- `app/api/plataforma/v1/organizaciones/route.ts`
- `app/api/plataforma/v1/organizaciones/[id]/route.ts`
- `app/api/plataforma/v1/organizaciones/[id]/trial/route.ts`
- `app/api/plataforma/v1/organizaciones/[id]/creditos/route.ts`
- `app/api/plataforma/v1/organizaciones/[id]/suspender/route.ts`
- `app/api/plataforma/v1/organizaciones/[id]/reactivar/route.ts`
- `app/api/plataforma/v1/billing/route.ts`
- `app/api/plataforma/v1/billing/verificar/route.ts`
- `app/api/plataforma/v1/billing/precios/sincronizar/route.ts`
- `app/api/plataforma/v1/billing/webhook/rotar/route.ts`
- `app/api/plataforma/v1/billing/webhook/probar/route.ts`
- `app/api/plataforma/v1/respaldos/route.ts`
- `app/api/plataforma/v1/respaldos/run/route.ts`
- `app/api/plataforma/v1/respaldos/test/route.ts`
- `app/api/plataforma/v1/smtp/test/route.ts`
- `app/api/plataforma/v1/auditoria/route.ts`
- `app/api/plataforma/v1/configuracion/route.ts`
- `app/api/plataforma/v1/configuracion/secretos/[field]/route.ts`
- `app/(dashboard)/plataforma/_diagnostico.tsx`
- `app/(dashboard)/plataforma/_tokens.tsx`
- `app/(dashboard)/plataforma/_auditoria.tsx`
- `lib/workers/platform-health-worker.ts`
- `app/api/mcp/route.ts`
- `app/api/mcp/oauth/register/route.ts`
- `app/api/mcp/oauth/authorize/route.ts`
- `app/api/mcp/oauth/token/route.ts`
- `app/api/mcp/oauth/revoke/route.ts`
- `app/.well-known/oauth-protected-resource/route.ts`
- `app/.well-known/oauth-authorization-server/route.ts`
- `app/(dashboard)/plataforma/autorizar-mcp/page.tsx`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/__tests__/tools.test.ts`
- `lib/mcp/__tests__/transport.test.ts`
- `lib/mcp/__tests__/auth.test.ts`
- `lib/mcp/__tests__/oauth.test.ts`
- `docs/PLATAFORMA_API.md`
- `docs/PLATAFORMA_MCP.md`

**Modificados**

- `prisma/schema.prisma` (+ migración)
- `lib/queue.ts` (`platform-health`)
- `lib/workers/index.ts` (registro del tick)
- `app/(dashboard)/plataforma/_view.tsx` (pestaña Diagnóstico, banda de estado)
- `app/api/plataforma/configuracion/route.ts` (auditoría)
- `app/api/plataforma/organizaciones/[id]/route.ts` (auditoría)
- `app/api/plataforma/respaldos/route.ts` (auditoría)
- `lib/billing/stripe.ts` (invalidar cache tras reconciliación)
- `lib/email/templates.ts` (`platformHealthTemplate`)
- `AGENTS.md` (documentar API, tokens, doctor y MCP)

## 17. Ejemplos de contrato

### `GET /api/plataforma/v1/status`

```json
{
  "status": "fail",
  "checkedAt": "2026-10-29T23:55:00.000Z",
  "live": true,
  "checks": [
    {
      "id": "billing.webhook",
      "label": "Webhook de Stripe",
      "status": "fail",
      "message": "El webhook secret no está configurado",
      "hint": "Pégalo en /plataforma → Configuración → Stripe"
    },
    {
      "id": "billing.prices",
      "label": "Precios de Stripe",
      "status": "ok",
      "message": "59 / 89 / 149 MXN mensuales",
      "details": { "ESSENTIAL": 5900, "BUSINESS": 8900, "PRO": 14900 }
    }
  ]
}
```

### `POST /api/plataforma/v1/billing/precios/sincronizar`

```json
{ "dryRun": true }
```

```json
{
  "ok": true,
  "data": {
    "dryRun": true,
    "diff": {
      "createPrices": [],
      "transferLookup": [
        { "plan": "BUSINESS", "priceId": "price_...", "lookupKey": "colibly_negocio_monthly" }
      ],
      "renameProducts": [],
      "archivePrices": [{ "priceId": "price_viejo", "reason": "precio 99 MXN sin lookup key vigente" }]
    }
  }
}
```

### `POST /api/plataforma/v1/organizaciones/{id}/trial`

```json
{ "days": 14, "confirm": true }
```

```json
{ "ok": true, "data": { "status": "TRIALING", "trialEndsAt": "2026-11-12T23:59:00.000Z" } }
```

### Handshake MCP remoto

```bash
curl -s https://app.colibly.com/api/mcp \
  -H "Authorization: Bearer plt_production_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

### Llamada de tool MCP

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "colibly_reconcile_prices",
    "arguments": { "dryRun": true }
  }
}
```

### Metadata OAuth

```bash
curl -s https://app.colibly.com/.well-known/oauth-protected-resource
```

```json
{
  "resource": "https://app.colibly.com/api/mcp",
  "authorization_servers": ["https://app.colibly.com"],
  "scopes_supported": [
    "platform:read",
    "org:write",
    "billing:write",
    "backup:write",
    "mail:test",
    "secret:write"
  ]
}
```

### Escritura de un secreto (sin exponerlo en argv)

```bash
NEW_SECRET='whsec_...' # viene de tu gestor, no del historial
jq -n --arg v "$NEW_SECRET" '{value: $v, confirm: "stripeWebhookSecret"}' |
  curl -s -X PUT https://app.colibly.com/api/plataforma/v1/configuracion/secretos/stripeWebhookSecret \
    -H "Authorization: Bearer plt_production_..." \
    -H "Content-Type: application/json" \
    --data-binary @-
```

```json
{ "ok": true, "data": { "field": "stripeWebhookSecret", "hasValue": true } }
```
