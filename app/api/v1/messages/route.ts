import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiContext } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, type ApiErrorCode } from "@/lib/api/respond";
import { findScopedContact, findScopedConversation } from "@/lib/api/resources";
import { apiSendMessageSchema, type ApiSendMessageInput } from "@/lib/api/schemas";
import { OutboundError, sendOutbound, type OutboundContent, type OutboundTarget } from "@/lib/messaging/outbound";
import { withIdempotency } from "@/lib/api/idempotency";

const OUTBOUND_STATUS: Record<OutboundError["code"], [number, ApiErrorCode]> = {
  window_closed: [422, "window_closed"],
  invalid_request: [400, "invalid_request"],
  not_found: [404, "not_found"],
  upstream_error: [502, "upstream_error"],
};

// POST /api/v1/messages — texto, botones (WhatsApp) o plantilla aprobada
// (WhatsApp). Destino: conversationId, o contactId (se usa su conversación).
// WhatsApp exige la ventana de 24 h para texto/botones: fuera de ella responde
// 422 window_closed y hay que mandar una plantilla. Una plantilla a un contacto
// de WhatsApp que aún no tiene chat (p. ej. recién creado por POST /contacts)
// abre el chat.
export const POST = withIdempotency(withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const parsed = apiSendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const input = parsed.data;

  const { target, openedChatId } = input.conversationId
    ? { target: (await findScopedConversation(ctx, input.conversationId)).target, openedChatId: null }
    : await targetForContact(ctx, input.contactId!, input.type === "template");

  try {
    const result = await sendOutbound(target, toContent(input), { source: "api" });
    const conversationId = target.kind === "whatsapp" ? target.chat.id : target.conversation.id;
    return apiOk({ id: result.messageId, conversationId, externalId: result.externalId }, 201);
  } catch (err) {
    // Si el chat se abrió para este envío y Meta lo rechazó, no dejar un chat
    // vacío en el inbox.
    if (openedChatId) await prisma.wAChat.delete({ where: { id: openedChatId } }).catch(() => {});
    if (err instanceof OutboundError) {
      const [status, code] = OUTBOUND_STATUS[err.code];
      throw new ApiError(status, code, err.message);
    }
    throw err;
  }
}));

function toContent(input: ApiSendMessageInput): OutboundContent {
  if (input.type === "text") return { type: "text", text: input.text! };
  if (input.type === "buttons") {
    return {
      type: "buttons",
      text: input.text!,
      buttons: input.buttons!.map((b, i) => ({ id: b.id ?? `btn_${i + 1}`, title: b.title })),
    };
  }
  return {
    type: "template",
    templateId: input.template!.id,
    bodyParams: input.template!.bodyParams,
    headerParam: input.template!.headerParam,
    buttonParam: input.template!.buttonParam,
  };
}

async function targetForContact(
  ctx: ApiContext,
  contactId: string,
  isTemplate: boolean
): Promise<{ target: OutboundTarget; openedChatId: string | null }> {
  const contact = await findScopedContact(ctx, contactId);
  const conversationId = contact.chat?.id ?? contact.conversation?.id;
  if (conversationId) return { target: (await findScopedConversation(ctx, conversationId)).target, openedChatId: null };

  if (!contact.accountId || !isTemplate) {
    throw new ApiError(
      422,
      "window_closed",
      "El contacto no tiene conversación todavía: el primer mensaje de WhatsApp debe ser una plantilla aprobada"
    );
  }
  const chat = await prisma.wAChat.create({
    data: { accountId: contact.accountId, remoteJid: contact.remoteJid, name: contact.name, contactId: contact.id },
    include: { account: true },
  });
  return { target: { kind: "whatsapp", chat }, openedChatId: chat.id };
}
