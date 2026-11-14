import type { WAAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enforceLimit, type ApiContext } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/respond";
import { API_WHATSAPP_ADMIN_PER_MINUTE } from "@/lib/api/constants";
import { MetaAdminError } from "@/lib/whatsapp/account-admin";
import { flowEndpointUri } from "@/lib/whatsapp/flow-endpoint";
import { fetchRemoteFile, OutboundMediaError } from "@/lib/messaging/outbound-media";
import { uploadTemplateHeaderMedia } from "@/lib/whatsapp/resumable-upload";
import { decrypt } from "@/lib/crypto";
import { TemplateCreateError } from "@/lib/whatsapp/template-create";

// Piezas comunes de las rutas que administran la cuenta de WhatsApp en Meta
// (/accounts/{id}/profile, /accounts/{id}/blocked-users, POST/DELETE /templates).

/** Cuenta de WhatsApp de la key con credenciales de Meta Cloud; 404/400/422 si no. */
export async function loadApiWhatsAppAccount(ctx: ApiContext, accountId: string): Promise<WAAccount> {
  if (ctx.channelAccountIds.includes(accountId)) {
    throw new ApiError(400, "invalid_request", "Esta operación solo está disponible en cuentas de WhatsApp");
  }
  const account = ctx.accountIds.includes(accountId)
    ? await prisma.wAAccount.findFirst({ where: { id: accountId, organizationId: ctx.organizationId } })
    : null;
  if (!account) throw new ApiError(404, "not_found", "Cuenta no encontrada");
  if (account.channel !== "META_CLOUD" || !account.accessToken || !account.phoneNumberId) {
    throw new ApiError(422, "invalid_request", "La cuenta no está conectada a WhatsApp Cloud API (falta Phone Number ID o token)");
  }
  return account;
}

/** Límite por organización de cambios en Meta. */
export async function enforceWhatsAppAdminLimit(req: Request, ctx: ApiContext): Promise<void> {
  await enforceLimit(req, "endpoint", `api-wa-admin:${ctx.organizationId}`, API_WHATSAPP_ADMIN_PER_MINUTE, 60,
    `Límite de ${API_WHATSAPP_ADMIN_PER_MINUTE} cambios por minuto en WhatsApp para la organización excedido`);
}

/** Errores de Meta, de archivos remotos y de plantillas → ApiError. Lo demás se relanza. */
export function toWhatsAppAdminApiError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  if (err instanceof MetaAdminError) {
    const meta = err.metaCode !== null ? { code: err.metaCode } : null;
    if (err.httpStatus === 422) throw new ApiError(422, "invalid_request", err.message, undefined, undefined, meta);
    if (err.httpStatus === 404) throw new ApiError(404, "not_found", err.message, undefined, undefined, meta);
    // 400 de Meta = dato que Meta no acepta (no una falla de Meta): es del integrador.
    if (err.httpStatus === 400) throw new ApiError(400, "invalid_request", `Meta: ${err.message}`, undefined, undefined, meta);
    throw new ApiError(502, "upstream_error", `Meta: ${err.message}`, undefined, undefined, meta);
  }
  if (err instanceof OutboundMediaError) throw new ApiError(400, "invalid_request", err.message);
  if (err instanceof TemplateCreateError) {
    throw new ApiError(err.status, err.status === 409 ? "conflict" : "invalid_request", err.message, undefined, undefined, err.metaCode !== null ? { code: err.metaCode } : null);
  }
  throw err;
}

/**
 * Descarga un archivo por URL y lo sube a la Resumable Upload API de la app de
 * Meta de la cuenta (foto de perfil, ejemplo de cabecera de plantilla).
 * Devuelve el handle que piden esos endpoints.
 */
export async function uploadRemoteFileToMeta(
  account: WAAccount,
  field: string,
  url: string,
  rules: { maxBytes: number; mimeTypes: string[] }
): Promise<string> {
  if (!account.appId) throw new ApiError(422, "invalid_request", `La cuenta no tiene App ID de Meta: no se puede subir ${field}`);
  const file = await fetchRemoteFile(field, url, rules);
  try {
    return await uploadTemplateHeaderMedia(account.appId, decrypt(account.accessToken!), file.buffer, file.mimeType);
  } catch (err) {
    throw new MetaAdminError(err instanceof Error ? err.message : "No se pudo subir el archivo a Meta", 502, null);
  }
}

const DAY_MS = 86_400_000;

/**
 * Rango de las analíticas (`since` y `until`, fechas ISO). Por omisión, los
 * últimos 30 días; como máximo `maxDays` (lo que Meta conserva y responde a tiempo).
 */
export function readAnalyticsRange(url: URL, maxDays = 365): { start: Date; end: Date } {
  const parse = (name: string) => {
    const raw = url.searchParams.get(name);
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", `${name} debe ser una fecha ISO 8601`);
    return d;
  };
  const end = parse("until") ?? new Date();
  const start = parse("since") ?? new Date(end.getTime() - 30 * DAY_MS);
  if (start >= end) throw new ApiError(400, "invalid_request", "since debe ser anterior a until");
  if (end.getTime() - start.getTime() > maxDays * DAY_MS) throw new ApiError(400, "invalid_request", `El rango admite máximo ${maxDays} días`);
  return { start, end };
}

/**
 * endpointUri de un Flow: el que manda el integrador, o el de Colibly con
 * useColiblyEndpoint (exige la llave ya subida con PATCH /flows-endpoint).
 * undefined = no cambiar.
 */
export function resolveFlowEndpointUri(
  account: Pick<WAAccount, "id" | "flowKeyUploadedAt">,
  input: { endpointUri?: string | null; useColiblyEndpoint?: boolean }
): string | null | undefined {
  if (input.useColiblyEndpoint) {
    if (!account.flowKeyUploadedAt) {
      throw new ApiError(422, "invalid_request", "Configura primero el endpoint de Flows de la cuenta (PATCH /accounts/{id}/flows-endpoint)");
    }
    return flowEndpointUri(account.id);
  }
  return input.endpointUri;
}
