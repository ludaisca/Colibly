import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { apiMarkReadSchema } from "@/lib/api/schemas";
import { findScopedConversation } from "@/lib/api/resources";
import { markMessageRead } from "@/lib/whatsapp";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/conversations/{id}/read — marca la conversación como leída en
// Colibly (unreadCount 0) y, en WhatsApp, también para el cliente (palomitas
// azules en su último mensaje). Con `typing: true` WhatsApp le muestra
// "escribiendo…" hasta 25 s o hasta tu respuesta. En otros canales solo se
// marca en Colibly (`typing` se ignora: la respuesta dice `typing: false`).
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:write");
  const { typing = false } = await readJsonBody(req, apiMarkReadSchema, { optional: true });
  const { id } = await params;
  const scoped = await findScopedConversation(ctx, id);

  if (scoped.kind === "channel") {
    await prisma.conversation.update({ where: { id: scoped.target.conversation.id }, data: { unreadCount: 0 } });
    return apiOk({ conversationId: id, read: true, typing: false, readOnWhatsApp: false });
  }

  const chat = scoped.target.chat;
  const lastInbound = await prisma.wAMessage.findFirst({
    where: { chatId: chat.id, direction: "INBOUND", wamid: { not: null } },
    orderBy: { timestamp: "desc" },
    select: { wamid: true },
  });
  let readOnWhatsApp = false;
  if (lastInbound?.wamid && chat.account.phoneNumberId && chat.account.accessToken) {
    try {
      await markMessageRead(chat.account.phoneNumberId, decrypt(chat.account.accessToken), lastInbound.wamid, { typing });
      readOnWhatsApp = true;
    } catch (err) {
      if (err instanceof MetaSendError) throw new ApiError(502, "upstream_error", err.message, undefined, undefined, err.metaCode !== null ? { code: err.metaCode } : null);
      throw err;
    }
  }
  await prisma.wAChat.update({ where: { id: chat.id }, data: { unreadCount: 0 } });
  return apiOk({ conversationId: id, read: true, typing: typing && readOnWhatsApp, readOnWhatsApp });
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
