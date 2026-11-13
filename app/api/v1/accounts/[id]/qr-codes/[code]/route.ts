import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiQrUpdateSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { deleteQrCode, saveQrCode } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string; code: string }> };

function readCode(raw: string): string {
  const code = decodeURIComponent(raw);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) throw new ApiError(400, "invalid_request", "code no es un código QR válido");
  return code;
}

// PATCH /api/v1/accounts/{id}/qr-codes/{code} — cambia el mensaje prellenado
// (el QR y el enlace siguen siendo los mismos).
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiQrUpdateSchema);
  const { id, code: raw } = await params;
  const code = readCode(raw);
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    return apiOk(await saveQrCode(account, { code, prefilledMessage: body.prefilledMessage }));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

// DELETE /api/v1/accounts/{id}/qr-codes/{code} — el QR y su enlace dejan de funcionar.
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id, code: raw } = await params;
  const code = readCode(raw);
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await deleteQrCode(account, code);
    return apiOk({ code, deleted: true });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const GET = methodNotAllowed("PATCH", "DELETE");
export const POST = GET;
export const PUT = GET;
