import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiQrCreateSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { listQrCodes, saveQrCode } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET/POST /api/v1/accounts/{id}/qr-codes — códigos QR y enlaces wa.me/message
// que abren el chat con un mensaje ya escrito. Viven en Meta.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk({ data: await listQrCodes(account) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiQrCreateSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    return apiOk(await saveQrCode(account, body), 201);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
