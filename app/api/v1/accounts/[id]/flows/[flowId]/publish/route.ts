import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { flowAction, getFlow } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string; flowId: string }> };

// POST /api/v1/accounts/{id}/flows/{flowId}/publish — publica el Flow (sin errores de validación). Ya no se puede editar su JSON.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id, flowId } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await getFlow(account, flowId);
    await flowAction(account, flowId, "publish");
    return apiOk(await getFlow(account, flowId));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
