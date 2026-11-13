import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { loadApiWhatsAppAccount, readAnalyticsRange } from "@/lib/api/whatsapp-admin";
import { getTemplateAnalytics } from "@/lib/whatsapp/template-analytics";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/templates/{id}/analytics — enviados, entregados, leídos y clics
// de una plantilla por día, según Meta (la misma fuente que la vista de
// plantillas de Colibly). Meta guarda hasta 90 días.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id } = await params;
  const template = ctx.accountIds.length ? await prisma.wATemplate.findFirst({ where: { id, waAccountId: { in: ctx.accountIds } } }) : null;
  if (!template) throw new ApiError(404, "not_found", "Plantilla no encontrada");
  const { start, end } = readAnalyticsRange(new URL(req.url), 90);
  const account = await loadApiWhatsAppAccount(ctx, template.waAccountId);
  if (!account.wabaId) throw new ApiError(422, "invalid_request", "La cuenta no tiene WABA ID");

  const result = await getTemplateAnalytics(account.wabaId, decrypt(account.accessToken!), template.templateId, start, end);
  if (!result.success) throw new ApiError(502, "upstream_error", `Meta: ${result.error}`);
  const totals = result.points.reduce(
    (acc, p) => ({ sent: acc.sent + p.sent, delivered: acc.delivered + p.delivered, read: acc.read + p.read, clicked: acc.clicked + p.clicked }),
    { sent: 0, delivered: 0, read: 0, clicked: 0 }
  );
  return apiOk({ templateId: template.id, since: start.toISOString(), until: end.toISOString(), totals, data: result.points });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
