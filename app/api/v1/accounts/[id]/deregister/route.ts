import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiDeregisterNumberSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { deregisterNumber } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/accounts/{id}/deregister — da de baja el número de Cloud API:
// deja de enviar y recibir hasta registrarlo otra vez (POST …/register). Pide
// confirm: true. La cuenta queda DISCONNECTED en Colibly con su historial.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  await readJsonBody(req, apiDeregisterNumberSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  if (account.coexistence) throw new ApiError(422, "invalid_request", "Un número de coexistencia se desconecta desde la app WhatsApp Business");
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await deregisterNumber(account);
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
  await prisma.wAAccount.update({ where: { id: account.id }, data: { status: "DISCONNECTED", disconnectedReason: "Dado de baja por API" } });
  return apiOk({ accountId: account.id, deregistered: true });
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
