import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { listWabaNumbers } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id}/phone-numbers — todos los números de la cuenta de
// WhatsApp Business (WABA) de esta cuenta, estén o no conectados a Colibly.
// accountId = la cuenta de Colibly de ese número (solo si es de tu organización).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    const numbers = await listWabaNumbers(account);
    const connected = await prisma.wAAccount.findMany({
      where: { organizationId: ctx.organizationId, phoneNumberId: { in: numbers.map((n) => n.phoneNumberId) } },
      select: { id: true, phoneNumberId: true },
    });
    const byPhone = new Map(connected.map((a) => [a.phoneNumberId, a.id]));
    return apiOk({
      accountId: account.id,
      wabaId: account.wabaId,
      data: numbers.map((n) => ({ ...n, accountId: byPhone.get(n.phoneNumberId) ?? null })),
    });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
