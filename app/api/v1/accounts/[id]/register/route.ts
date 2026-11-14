import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiRegisterNumberSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { registerNumber } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/accounts/{id}/register — registra el número en Cloud API (p. ej.
// tras darlo de baja o si Meta lo pide). Sin pin usa el que guarda Colibly.
// Los números de coexistencia los registra la app WhatsApp Business: 422.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiRegisterNumberSchema, { optional: true });
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  if (account.coexistence) throw new ApiError(422, "invalid_request", "Un número de coexistencia lo registra la app WhatsApp Business, no la API");
  const pin = body?.pin ?? (account.twoStepPin ? decrypt(account.twoStepPin) : null);
  if (!pin) throw new ApiError(400, "invalid_request", "Envía pin: Colibly no tiene guardado el PIN de este número", undefined, [{ path: "pin", message: "requerido" }]);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await registerNumber(account, pin);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
  await prisma.wAAccount.update({
    where: { id: account.id },
    data: { twoStepPin: encrypt(pin), status: "CONNECTED", disconnectedReason: null, errorMessage: null },
  });
  return apiOk({ accountId: account.id, registered: true });
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
