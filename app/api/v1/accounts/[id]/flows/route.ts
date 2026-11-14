import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiFlowCreateSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, resolveFlowEndpointUri, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { createFlow, getFlow, listFlows } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id}/flows — los WhatsApp Flows de la cuenta (del
// Administrador de WhatsApp o de POST aquí). Se mandan con POST /messages type
// flow; solo los PUBLISHED, o los DRAFT con flow.draft = true para probarlos.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk({ data: await listFlows(account) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

// POST /api/v1/accounts/{id}/flows — crea un Flow (DRAFT, o publicado con
// publish: true si el JSON no tiene errores). Responde el Flow con los
// validationErrors de Meta.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiFlowCreateSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    const endpointUri = resolveFlowEndpointUri(account, body);
    const created = await createFlow(account, { ...body, endpointUri: endpointUri ?? undefined });
    return apiOk(await getFlow(account, created.id), 201);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
