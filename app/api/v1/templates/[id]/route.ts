import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiTemplateEditSchema } from "@/lib/api/schemas";
import { precheckTemplateDefinition, resolveTemplateExamples } from "@/lib/api/template-examples";
import type { TemplateCategory } from "@/lib/whatsapp/template-definition";
import { editAccountTemplate } from "@/lib/whatsapp/template-create";
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

// PATCH /api/v1/templates/{id} — edita la plantilla en Meta con la definición
// completa (components; category solo si no está aprobada). Vuelve a PENDING.
// Meta deja editar una aprobada 1 vez cada 24 h y 10 veces en 30 días.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiTemplateEditSchema);
  const { id } = await params;
  const template = await findTemplate(ctx.accountIds, id);
  if (template.status === "DELETED") throw new ApiError(404, "not_found", "Plantilla no encontrada");
  const account = await loadApiWhatsAppAccount(ctx, template.waAccountId);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    precheckTemplateDefinition(template.name, template.language, (body.category ?? template.category) as TemplateCategory, body.components);
    const updated = await editAccountTemplate(account, template, { category: body.category, components: await resolveTemplateExamples(account, body.components) });
    return apiOk({ ...serializeTemplate(updated), components: updated.components });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH", "DELETE");
export const PUT = POST;
