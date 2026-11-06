import { prisma } from "@/lib/prisma";
import { authenticateApiKey, enforceLimit } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeTemplate } from "@/lib/api/catalog";
import { syncAccountTemplates, TemplateSyncError } from "@/lib/whatsapp/template-sync";
import { API_TEMPLATE_SYNCS_PER_MINUTE } from "@/lib/api/constants";

// POST /api/v1/templates/sync — pregunta a Meta por las plantillas de las
// cuentas de la key (todas, o una con ?accountId=) y devuelve la lista ya
// actualizada, con el mismo formato que GET /templates. Sirve para ver al
// momento el resultado de la revisión de una plantilla recién creada; el
// webhook de Meta también la actualiza solo, esto es el atajo explícito.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  await enforceLimit(req, "endpoint", `api-tpl-sync:${ctx.organizationId}`, API_TEMPLATE_SYNCS_PER_MINUTE, 60,
    `Límite de ${API_TEMPLATE_SYNCS_PER_MINUTE} sincronizaciones de plantillas por minuto para la organización excedido`);

  const accountId = new URL(req.url).searchParams.get("accountId");
  const ids = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  if (accountId && ids.length === 0) throw new ApiError(404, "not_found", "Cuenta no encontrada");

  const accounts = await prisma.wAAccount.findMany({
    where: { id: { in: ids }, organizationId: ctx.organizationId, wabaId: { not: null }, accessToken: { not: null } },
  });
  if (accounts.length === 0) {
    throw new ApiError(422, "invalid_request", "Ninguna cuenta de la key tiene WABA ID y token para sincronizar plantillas");
  }

  const synced: string[] = [];
  const failed: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    try {
      await syncAccountTemplates(account);
      synced.push(account.id);
    } catch (err) {
      failed.push({ accountId: account.id, error: err instanceof TemplateSyncError ? err.message : "No se pudo sincronizar" });
    }
  }
  if (synced.length === 0) {
    throw new ApiError(502, "upstream_error", failed[0]?.error ?? "Meta no respondió", undefined,
      failed.map((f) => ({ path: `accountId:${f.accountId}`, message: f.error })));
  }

  const rows = await prisma.wATemplate.findMany({
    where: { waAccountId: { in: synced } },
    select: { id: true, waAccountId: true, name: true, language: true, category: true, status: true, statusReason: true, components: true, syncedAt: true },
    orderBy: [{ name: "asc" }, { language: "asc" }],
  });
  return apiOk({ data: rows.map(serializeTemplate), synced, failed });
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
