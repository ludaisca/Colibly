import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiConversationalAutomationSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { getConversationalAutomation, updateConversationalAutomation } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET/PATCH /api/v1/accounts/{id}/conversational-automation — sugerencias de
// inicio (botones que ve el cliente al abrir el chat) y comandos "/" del
// número. Al tocarlos, el cliente manda ese texto como un mensaje normal.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk({ accountId: account.id, ...(await getConversationalAutomation(account)) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiConversationalAutomationSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await updateConversationalAutomation(account, body);
    return apiOk({ accountId: account.id, ...(await getConversationalAutomation(account)) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
