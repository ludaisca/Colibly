import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiConversationalAutomationSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { getConversationalAutomation, updateConversationalAutomation } from "@/lib/whatsapp/account-admin";
import { configureWelcomeMessage, WelcomeConfigError } from "@/lib/whatsapp/welcome";
import { prisma } from "@/lib/prisma";

// Lo de Meta más el texto del saludo, que vive en Colibly.
async function current(account: Parameters<typeof getConversationalAutomation>[0] & { id: string }) {
  const [meta, row] = await Promise.all([
    getConversationalAutomation(account),
    prisma.wAAccount.findUnique({ where: { id: account.id }, select: { welcomeMessageText: true } }),
  ]);
  return { accountId: account.id, ...meta, welcomeMessageText: row?.welcomeMessageText ?? null };
}

type Params = { params: Promise<{ id: string }> };

// GET/PATCH /api/v1/accounts/{id}/conversational-automation — sugerencias de
// inicio (botones que ve el cliente al abrir el chat) y comandos "/" del
// número. Al tocarlos, el cliente manda ese texto como un mensaje normal.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk(await current(account));
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
    const { welcomeMessage, ...rest } = body;
    if (welcomeMessage) {
      await configureWelcomeMessage(account, welcomeMessage).catch((err) => {
        if (err instanceof WelcomeConfigError) throw new ApiError(422, "invalid_request", err.message);
        throw err;
      });
    }
    if (rest.prompts !== undefined || rest.commands !== undefined) await updateConversationalAutomation(account, rest);
    return apiOk(await current(account));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
