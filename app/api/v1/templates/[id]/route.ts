import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeTemplate } from "@/lib/api/catalog";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { deleteMetaTemplate } from "@/lib/whatsapp/account-admin";
import { markTemplatesDeleted } from "@/lib/whatsapp/template-sync";

type Params = { params: Promise<{ id: string }> };

async function findTemplate(accountIds: string[], id: string) {
  const template = accountIds.length ? await prisma.wATemplate.findFirst({ where: { id, waAccountId: { in: accountIds } } }) : null;
  if (!template) throw new ApiError(404, "not_found", "Plantilla no encontrada");
  return template;
}

// GET /api/v1/templates/{id} — la plantilla con sus componentes tal como los
// guarda Meta (HEADER, BODY, FOOTER, BUTTONS).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id } = await params;
  const template = await findTemplate(ctx.accountIds, id);
  return apiOk({ ...serializeTemplate(template), components: template.components });
});

// DELETE /api/v1/templates/{id} — la borra en Meta (solo ese idioma) y queda
// como DELETED en Colibly (las campañas que la usaron conservan su historial).
// Meta no deja volver a usar el nombre durante 30 días.
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const template = await findTemplate(ctx.accountIds, id);
  if (template.status === "DELETED") throw new ApiError(404, "not_found", "Plantilla no encontrada");
  const account = await loadApiWhatsAppAccount(ctx, template.waAccountId);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await deleteMetaTemplate(account, template);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
  await markTemplatesDeleted([template.id]);
  return apiOk({ id: template.id, deleted: true });
});

export const POST = methodNotAllowed("GET", "DELETE");
export const PUT = POST;
export const PATCH = POST;
