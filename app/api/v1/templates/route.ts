import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { serializeTemplate } from "@/lib/api/catalog";
import { apiTemplateCreateSchema } from "@/lib/api/schemas";
import { withIdempotency } from "@/lib/api/idempotency";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { refreshPendingTemplates } from "@/lib/whatsapp/template-sync";
import { assertCanManageTemplates, createAccountTemplateFromDefinition } from "@/lib/whatsapp/template-create";
import { precheckTemplateDefinition, resolveTemplateExamples } from "@/lib/api/template-examples";

// GET /api/v1/templates — plantillas de WhatsApp de las cuentas de la key, con
// lo que pide cada una para enviarse por POST /messages (type "template"):
// cuántos bodyParams, si lleva headerParam (y de qué formato) y si el botón
// URL pide buttonParam. Solo las APPROVED se pueden enviar. Lista completa
// (no paginada), ordenada por nombre. Filtros: accountId, status.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  // El estado es el de Meta (APPROVED, PENDING, REJECTED, PAUSED, DISABLED…).
  const status = url.searchParams.get("status")?.trim().toUpperCase() || null;
  const accountIds = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const rows = await prisma.wATemplate.findMany({
    where: { waAccountId: { in: accountIds }, ...(status ? { status } : {}) },
    select: { id: true, waAccountId: true, name: true, language: true, category: true, status: true, statusReason: true, components: true, syncedAt: true },
    orderBy: [{ name: "asc" }, { language: "asc" }],
  });
  // Plantillas en revisión: refresca en segundo plano (≤ 1 vez por minuto por
  // cuenta) por si el webhook de Meta no llegó. POST /templates/sync lo hace al momento.
  if (rows.some((r) => r.status === "PENDING" || r.status === "IN_APPEAL")) after(() => refreshPendingTemplates(accountIds));
  return apiOk({ data: rows.map(serializeTemplate) });
});

// POST /api/v1/templates — crea una plantilla en Meta (queda PENDING hasta que
// Meta la revise; el resultado llega por el evento template.status_changed o
// con GET /templates/{id}). Mismas reglas que el formulario de Colibly:
// MARKETING o UTILITY, variables {{1}}… seguidas con ejemplo cada una.
export const POST = withIdempotency(withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiTemplateCreateSchema);
  const account = await loadApiWhatsAppAccount(ctx, body.accountId);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    assertCanManageTemplates(account);
    const { accountId: _accountId, components, ...rest } = body;
    precheckTemplateDefinition(rest.name, rest.language, rest.category, components);
    const template = await createAccountTemplateFromDefinition(account, { ...rest, components: await resolveTemplateExamples(account, components) });
    return apiOk({ ...serializeTemplate(template), components: template.components }, 201);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
}));

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
