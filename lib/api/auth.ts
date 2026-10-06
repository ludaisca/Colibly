import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { isRestricted as isKeyRestricted, resolveIntegrationScope, type ResolvedScope } from "@/lib/integrations/account-scope";
import { ApiError } from "./respond";
import { API_KEY_PREFIX } from "./keys";
import type { ApiScope } from "./scopes";
import { hasApiAccess, isOrgWritable } from "@/lib/billing/gates";

export interface ApiContext extends ResolvedScope {
  keyId: string;
  userId: string;
  organizationId: string;
  scopes: string[];
  // La key tiene recorte de cuentas: no ve nada que no cuelgue de ellas (los
  // negocios sin conversación ligada, que son de toda la organización, tampoco).
  restricted: boolean;
}

// 120 req/min por key: holgado para una integración normal (CRM ↔ ERP,
// Zapier), y acota el daño de una key filtrada o de un bucle mal hecho.
const REQUESTS_PER_MINUTE = 120;
// No se escribe lastUsedAt en cada request — basta con resolución de minutos.
const LAST_USED_RESOLUTION_MS = 60_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Autentica `Authorization: Bearer sk_live_...`, exige `scope` si se pide y
// devuelve el alcance ya resuelto (cuentas del dueño ∩ recorte de la key).
// Lanza ApiError; los handlers van envueltos en withApiErrors.
export async function authenticateApiKey(req: Request, scope?: ApiScope): Promise<ApiContext> {
  const header = req.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!secret.startsWith(API_KEY_PREFIX)) {
    await throttleBadKey(req);
    throw new ApiError(401, "unauthorized", "Falta la API key (Authorization: Bearer sk_live_...)");
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(secret) },
    include: { user: { select: { role: true, disabledAt: true } } },
  });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) {
    await throttleBadKey(req);
    throw new ApiError(401, "unauthorized", "API key inválida, revocada o expirada");
  }
  // Las keys son de admins (mismo criterio que Meta Ads/config IA): si el
  // dueño deja de ser admin o se desactiva, sus keys dejan de funcionar al
  // instante, igual que su sesión.
  if (key.user.role !== "admin" || key.user.disabledAt) {
    throw new ApiError(401, "unauthorized", "El dueño de esta API key ya no tiene acceso");
  }

  // Facturación: la API es del plan Pro, y en solo lectura solo se consulta.
  if (!(await hasApiAccess(key.organizationId))) {
    throw new ApiError(402, "plan_limit", "La API está incluida en el plan Pro. Mejora el plan de tu cuenta para usarla.");
  }
  if (!SAFE_METHODS.has(req.method) && !(await isOrgWritable(key.organizationId))) {
    throw new ApiError(402, "read_only", "La cuenta está en solo lectura (prueba vencida o pago pendiente): la API solo admite consultas.");
  }

  const { allowed } = await rateLimit(`api:${key.id}`, REQUESTS_PER_MINUTE, 60);
  if (!allowed) {
    throw new ApiError(429, "rate_limited", `Límite de ${REQUESTS_PER_MINUTE} solicitudes por minuto excedido`);
  }

  if (scope && !key.scopes.includes(scope)) {
    throw new ApiError(403, "forbidden", `Esta API key no tiene el permiso ${scope}`);
  }

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  const resolved = await resolveIntegrationScope(key.userId, key);
  return { keyId: key.id, userId: key.userId, organizationId: key.organizationId, scopes: key.scopes, restricted: isKeyRestricted(key), ...resolved };
}

// Frena la enumeración de keys desde una misma IP.
async function throttleBadKey(req: Request): Promise<void> {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`api-bad-key:${ip}`, 30, 60);
  if (!allowed) throw new ApiError(429, "rate_limited", "Demasiados intentos con una API key inválida");
}
