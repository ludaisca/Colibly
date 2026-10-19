import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { rateLimit } from "@/lib/rate-limit";
import { sendOutbound, OutboundError } from "@/lib/messaging/outbound";
import { BillingBlockedError } from "@/lib/billing/gates";
import { eventRefsForChat } from "@/lib/events/refs";
import { pauseConversationalRuns } from "@/lib/automations/dispatch";
import { metaSendErrorMessage } from "@/lib/whatsapp/send-errors";

export const sendChatTemplateSchema = z.object({
  templateId: z.string().min(1, "Elige una plantilla"),
  bodyParams: z.array(z.string().trim().min(1, "Completa todas las variables").max(1024)).max(20).default([]),
  headerParam: z.string().trim().max(60).nullish(),
  buttonParam: z.string().trim().max(200).nullish(),
});

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

// "Enviar plantilla" desde la bandeja (chat de WhatsApp). Funciona con la
// ventana de 24 h abierta o cerrada: las plantillas aprobadas están exentas.
// Pasa por sendOutbound (gate de solo lectura, validación de la plantilla,
// texto renderizado, message.sent) — el mismo camino que automatizaciones.
export async function sendTemplateToChat(chatId: string, userId: string, rawBody: unknown): Promise<HandlerResult> {
  const { allowed } = await rateLimit(`chat-send:${userId}`, 30, 60);
  if (!allowed) return { status: 429, body: { error: "Demasiados mensajes enviados, espera un momento" } };

  const resolved = await resolveChatChannel(chatId, userId);
  if (!resolved) return { status: 404, body: { error: "Chat no encontrado" } };
  if (resolved.channel !== "WHATSAPP") {
    return { status: 400, body: { error: "Las plantillas solo existen en WhatsApp" } };
  }

  const parsed = sendChatTemplateSchema.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { error: parsed.error.issues[0].message } };

  // Acceso por cuenta (y con ello por organización): resolved.accountIds solo
  // trae cuentas de la organización del usuario.
  const chat = await prisma.wAChat.findFirst({
    where: { id: chatId, accountId: { in: resolved.accountIds } },
    include: { account: true },
  });
  if (!chat) return { status: 404, body: { error: "Chat no encontrado" } };

  const { templateId, bodyParams, headerParam, buttonParam } = parsed.data;
  let messageId: string;
  try {
    ({ messageId } = await sendOutbound(
      { kind: "whatsapp", chat },
      { type: "template", templateId, bodyParams, headerParam: headerParam || null, buttonParam: buttonParam || null },
      { source: "agent", senderId: userId }
    ));
  } catch (err) {
    if (err instanceof BillingBlockedError) return { status: 403, body: { error: err.message, code: "billing_blocked" } };
    if (err instanceof OutboundError) {
      const status = err.code === "not_found" ? 404 : err.code === "invalid_request" ? 400 : 502;
      const error = err.code === "upstream_error" ? metaSendErrorMessage(err.metaCode, err.message) : err.message;
      return { status, body: { error, code: err.code, metaCode: err.metaCode ?? null } };
    }
    throw err;
  }

  if (chat.firstResponseAt === null) {
    await prisma.wAChat.update({ where: { id: chat.id }, data: { firstResponseAt: new Date() } });
  }
  // Un humano tomó la conversación (igual que en /send). message.sent ya lo
  // emitió sendOutbound.
  const refs = await eventRefsForChat(chat.id);
  if (refs?.chat) {
    await pauseConversationalRuns(refs.chat).catch((e) => console.error("[send-template] pauseConversationalRuns falló:", e));
  }

  const message = await prisma.wAMessage.findFirst({ where: { id: messageId, chatId: chat.id } });
  return { status: 200, body: message ?? { id: messageId } };
}
