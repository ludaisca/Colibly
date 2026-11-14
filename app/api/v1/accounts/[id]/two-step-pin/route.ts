import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiTwoStepPinSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { setTwoStepPin } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/accounts/{id}/two-step-pin — cambia el PIN de 6 dígitos de la
// verificación en dos pasos del número (lo pide Meta para registrarlo).
// Colibly lo guarda cifrado para volver a registrar el número sin pedirlo.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { pin } = await readJsonBody(req, apiTwoStepPinSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await setTwoStepPin(account, pin);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
  await prisma.wAAccount.update({ where: { id: account.id }, data: { twoStepPin: encrypt(pin) } });
  return apiOk({ accountId: account.id, updated: true });
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
