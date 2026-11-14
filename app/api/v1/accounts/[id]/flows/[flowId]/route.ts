import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiFlowUpdateSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, resolveFlowEndpointUri, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { deleteFlow, getFlow, updateFlowMetadata, uploadFlowJson } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string; flowId: string }> };

// GET /api/v1/accounts/{id}/flows/{flowId} — estado, errores de validación,
// endpoint y una URL de vista previa (temporal) del Flow.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id, flowId } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk(await getFlow(account, flowId));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

// PATCH — nombre, categorías, endpoint y/o el JSON del Flow. Meta solo deja
// cambiar el JSON de un Flow en DRAFT; uno publicado se clona con cloneFlowId.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiFlowUpdateSchema);
  const { id, flowId } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await getFlow(account, flowId);
    const endpointUri = resolveFlowEndpointUri(account, body);
    await updateFlowMetadata(account, flowId, { name: body.name, categories: body.categories, endpointUri });
    if (body.flowJson) await uploadFlowJson(account, flowId, body.flowJson);
    return apiOk(await getFlow(account, flowId));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

// DELETE — solo Flows en DRAFT; uno publicado se retira con …/deprecate.
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id, flowId } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await getFlow(account, flowId);
    await deleteFlow(account, flowId);
    return apiOk({ id: flowId, deleted: true });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH", "DELETE");
export const PUT = POST;
