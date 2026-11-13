import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiBlockUsersSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { blockUsers, listBlockedUsers } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET/POST /api/v1/accounts/{id}/blocked-users — la lista de bloqueo del
// número en WhatsApp (vive en Meta). Un bloqueado no puede escribir al número
// ni recibir mensajes de él. Regla de Meta: solo se puede bloquear a quien
// escribió en las últimas 24 h. Desbloquear: DELETE /blocked-users/{phone}.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  const { limit, cursor } = readPageParams(new URL(req.url));
  try {
    const page = await listBlockedUsers(account, { limit, cursor });
    // `cursor` es el de Meta: se pasa tal cual en ?cursor= para la página siguiente.
    return apiOk({ data: page.waIds.map((waId) => ({ phone: waId })), nextCursor: page.nextCursor });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { phones } = await readJsonBody(req, apiBlockUsersSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    const result = await blockUsers(account, [...new Set(phones)]);
    // 200 aunque falle alguno: cada teléfono trae su resultado.
    return apiOk({
      blocked: result.done.map((u) => ({ phone: u.waId ?? u.input.replace(/\D/g, "") })),
      failed: result.failed.map((u) => ({ phone: u.input.replace(/\D/g, ""), error: u.error })),
    });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
