import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { rateLimit, RateLimitUnavailableError, type RateLimitResult } from "@/lib/rate-limit";
import { resolveIntegrationScope, type ResolvedScope } from "@/lib/integrations/account-scope";
import { ApiError } from "./respond";
import { API_KEY_PREFIX } from "./keys";
import type { ApiScope } from "./scopes";
import { hasApiAccess, isOrgWritable } from "@/lib/billing/gates";
import { clientIp } from "@/lib/net/client-ip";
import {
  API_BAD_KEY_ATTEMPTS_PER_MINUTE,
  API_IP_REQUESTS_PER_MINUTE,
  API_ORG_REQUESTS_PER_MINUTE,
  API_REQUESTS_PER_MINUTE,
  API_UNAVAILABLE_RETRY_SECONDS,
} from "./constants";
import { mergeRateLimitInfo, setRateLimitInfo, type RateLimitScope } from "./rate-headers";
import { getCachedApiKey, getCachedOrgAccess, setCachedApiKey, setCachedOrgAccess, type CachedApiKey } from "./auth-cache";

export interface ApiContext extends ResolvedScope {
  keyId: string;
  userId: string;
  organizationId: string;
  scopes: string[];
}

// Límites en capas (todos en Redis, compartidos entre instancias):
//   1. por IP  — API_IP_REQUESTS_PER_MINUTE (3000): red de seguridad, con o sin key.
//   2. por key — API_REQUESTS_PER_MINUTE (120): acota una key filtrada o un bucle.
//   3. por organización — API_ORG_REQUESTS_PER_MINUTE (600): suma de todas sus keys.
//   4. por endpoint — ver enforceEndpointLimit (POST /messages, GET /conversations).
// Si Redis no responde, la API responde 503 (fail-closed): contar en memoria
// por proceso multiplicaría el límite por el número de instancias.
const REQUESTS_PER_MINUTE = API_REQUESTS_PER_MINUTE;
// No se escribe lastUsedAt en cada request — basta con resolución de minutos.
const LAST_USED_RESOLUTION_MS = 60_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const LIMIT_MESSAGES: Record<RateLimitScope, (n: number) => string> = {
  key: (n) => `Límite de ${n} solicitudes por minuto excedido`,
  organization: (n) => `Límite de ${n} solicitudes por minuto para la organización (todas sus keys) excedido`,
  ip: (n) => `Límite de ${n} solicitudes por minuto desde esta IP excedido`,
  endpoint: (n) => `Límite de ${n} solicitudes por minuto para este endpoint excedido`,
  daily: (n) => `Cupo diario de ${n} excedido`,
};

export function rateLimiterUnavailable(): ApiError {
  return new ApiError(503, "service_unavailable", "Servicio temporalmente no disponible; reintenta en unos segundos", {
    "Retry-After": String(API_UNAVAILABLE_RETRY_SECONDS),
  });
}

// Aplica un límite fail-closed y anota sus headers; lanza 429 si no pasa.
export async function enforceLimit(
  req: Request,
  scope: RateLimitScope,
  key: string,
  limit: number,
  windowSeconds = 60,
  message?: string
): Promise<RateLimitResult> {
  let result: RateLimitResult;
  try {
    result = await rateLimit(key, limit, windowSeconds, { failClosed: true });
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) throw rateLimiterUnavailable();
    throw err;
  }
  const info = { limit, remaining: result.remaining, resetAt: result.resetAt, scope };
  if (!result.allowed) {
    setRateLimitInfo(req, { ...info, remaining: 0 });
    throw new ApiError(429, "rate_limited", message ?? LIMIT_MESSAGES[scope](limit));
  }
  mergeRateLimitInfo(req, info);
  return result;
}

async function loadKey(keyHash: string): Promise<CachedApiKey | null> {
  const cached = await getCachedApiKey(keyHash);
  if (cached) return cached;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: { select: { role: true, disabledAt: true } } },
  });
  if (!key) return null;
  const value: CachedApiKey = {
    id: key.id,
    userId: key.userId,
    organizationId: key.organizationId,
    scopes: key.scopes,
    accountIds: key.accountIds,
    channelAccountIds: key.channelAccountIds,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    user: { role: key.user.role, disabledAt: key.user.disabledAt?.toISOString() ?? null },
  };
  // Solo se cachean keys utilizables: una revocada o vencida responde 401 sin
  // caché (y no ocupa Redis por cada intento).
  if (!value.revokedAt && !(value.expiresAt && new Date(value.expiresAt) <= new Date())) {
    await setCachedApiKey(keyHash, value);
  }
  return value;
}

async function loadOrgAccess(organizationId: string) {
  const cached = await getCachedOrgAccess(organizationId);
  if (cached) return cached;
  const [apiAccess, writable] = await Promise.all([hasApiAccess(organizationId), isOrgWritable(organizationId)]);
  const value = { apiAccess, writable };
  await setCachedOrgAccess(organizationId, value);
  return value;
}

// Autentica `Authorization: Bearer sk_live_...`, exige `scope` si se pide y
// devuelve el alcance ya resuelto (cuentas del dueño ∩ recorte de la key).
// Lanza ApiError; los handlers van envueltos en withApiErrors.
export async function authenticateApiKey(req: Request, scope?: ApiScope): Promise<ApiContext> {
  // 1. Red de seguridad por IP (antes de tocar la base).
  await enforceLimit(req, "ip", `api-ip:${clientIp(req)}`, API_IP_REQUESTS_PER_MINUTE);

  const header = req.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!secret.startsWith(API_KEY_PREFIX)) {
    await throttleBadKey(req);
    throw new ApiError(401, "unauthorized", "Falta la API key (Authorization: Bearer sk_live_...)");
  }

  const keyHash = hashToken(secret);
  const key = await loadKey(keyHash);
  if (!key || key.revokedAt || (key.expiresAt && new Date(key.expiresAt) <= new Date())) {
    await throttleBadKey(req);
    throw new ApiError(401, "unauthorized", "API key inválida, revocada o expirada");
  }
  // Las keys son de admins (mismo criterio que Meta Ads/config IA): si el
  // dueño deja de ser admin o se desactiva, sus keys dejan de funcionar al
  // instante, igual que su sesión (la degradación invalida el caché).
  if (key.user.role !== "admin" || key.user.disabledAt) {
    throw new ApiError(401, "unauthorized", "El dueño de esta API key ya no tiene acceso");
  }

  // Facturación: la API es del plan Pro, y en solo lectura solo se consulta.
  const access = await loadOrgAccess(key.organizationId);
  if (!access.apiAccess) {
    throw new ApiError(402, "plan_limit", "La API está incluida en el plan Pro. Mejora el plan de tu cuenta para usarla.");
  }
  if (!SAFE_METHODS.has(req.method) && !access.writable) {
    throw new ApiError(402, "read_only", "La cuenta está en solo lectura (prueba vencida o pago pendiente): la API solo admite consultas.");
  }

  // 2 y 3. Por key y por organización. X-RateLimit-* en toda respuesta
  // autenticada (y Retry-After en el 429): withApiErrors los agrega.
  await enforceLimit(req, "key", `api:${key.id}`, REQUESTS_PER_MINUTE);
  await enforceLimit(req, "organization", `api-org:${key.organizationId}`, API_ORG_REQUESTS_PER_MINUTE);

  if (scope && !key.scopes.includes(scope)) {
    throw new ApiError(403, "forbidden", `Esta API key no tiene el permiso ${scope}`);
  }

  if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > LAST_USED_RESOLUTION_MS) {
    const now = new Date();
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } }).catch(() => {});
    key.lastUsedAt = now.toISOString();
    if (key.resolved) await setCachedApiKey(keyHash, key);
  }

  if (!key.resolved) {
    key.resolved = await resolveIntegrationScope(key.userId, key);
    await setCachedApiKey(keyHash, key);
  }
  return { keyId: key.id, userId: key.userId, organizationId: key.organizationId, scopes: key.scopes, ...key.resolved };
}

// Frena la enumeración de keys desde una misma IP (IP confiable: ver
// lib/net/client-ip.ts — el primer X-Forwarded-For lo inventa el cliente).
async function throttleBadKey(req: Request): Promise<void> {
  let result: RateLimitResult;
  try {
    result = await rateLimit(`api-bad-key:${clientIp(req)}`, API_BAD_KEY_ATTEMPTS_PER_MINUTE, 60, { failClosed: true });
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) throw rateLimiterUnavailable();
    throw err;
  }
  if (!result.allowed) {
    setRateLimitInfo(req, { limit: API_BAD_KEY_ATTEMPTS_PER_MINUTE, remaining: 0, resetAt: result.resetAt, scope: "ip" });
    throw new ApiError(429, "rate_limited", "Demasiados intentos con una API key inválida");
  }
}
