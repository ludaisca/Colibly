import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiFlowsEndpointSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { configureFlowEndpoint, flowEndpointState } from "@/lib/whatsapp/flow-endpoint";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id}/flows-endpoint — el endpoint de datos de Flows que
// aloja Colibly para la cuenta (endpointUri, para el Flow) y a qué URL tuya
// reenvía cada solicitud ya descifrada.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  return apiOk({ accountId: account.id, ...flowEndpointState(account) });
});

// PATCH — { url } activa o cambia el reenvío (la primera vez genera la llave
// del número, la sube a Meta y devuelve `secret` una sola vez); { url: null }
// lo apaga. ?rotateSecret=true genera un secreto nuevo.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiFlowsEndpointSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  const rotateSecret = new URL(req.url).searchParams.get("rotateSecret") === "true";
  try {
    return apiOk({ accountId: account.id, ...(await configureFlowEndpoint(account, body.url, { rotateSecret })) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
