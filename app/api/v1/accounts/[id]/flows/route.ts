import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { listFlows } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id}/flows — los WhatsApp Flows de la cuenta (se crean
// en el Administrador de WhatsApp). Se mandan con POST /messages type flow;
// solo los PUBLISHED, o los DRAFT con flow.draft = true para probarlos.
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

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
