import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { unblockUsers } from "@/lib/whatsapp/account-admin";
import { apiPhoneDigits } from "@/lib/phone/e164";

type Params = { params: Promise<{ id: string; phone: string }> };

// DELETE /api/v1/accounts/{id}/blocked-users/{phone} — quita el bloqueo.
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id, phone: raw } = await params;
  const phone = apiPhoneDigits(decodeURIComponent(raw));
  if (phone.length < 8 || phone.length > 15) throw new ApiError(400, "invalid_request", "phone debe tener entre 8 y 15 dígitos, con código de país");
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    const result = await unblockUsers(account, [phone]);
    if (result.failed.length > 0) throw new ApiError(502, "upstream_error", `Meta: ${result.failed[0].error}`);
    return apiOk({ phone, blocked: false });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const GET = methodNotAllowed("DELETE");
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
