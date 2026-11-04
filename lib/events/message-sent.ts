import { prisma } from "@/lib/prisma";
import { publicText } from "@/lib/messages/serialize";
import { legacySourceOf, sentByOf, type OutboundOrigin } from "@/lib/messages/origin";
import { BACKGROUND_EVENT_PRIORITY, emitDomainEvent, type EmitOptions } from "./emit";

// Punto único de `message.sent`: lo llama todo camino que guarda un saliente
// (bandeja, API/automatizaciones vía sendOutbound, bot, campañas, secuencias,
// recuperación, avisos, ecos de la app WhatsApp Business). Lee el mensaje ya
// guardado, así el evento describe exactamente la fila que verá la API.
//
// Nunca lanza (igual que emitDomainEvent): el mensaje ya salió.
export async function emitMessageSent(
  kind: "whatsapp" | "channel",
  messageId: string,
  origin: OutboundOrigin,
  opts: { occurredAt?: Date; emit?: EmitOptions } = {}
): Promise<void> {
  try {
    if (kind === "whatsapp") {
      const m = await prisma.wAMessage.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          messageType: true,
          body: true,
          senderId: true,
          sender: { select: { name: true } },
          chat: { select: { id: true, accountId: true, contactId: true } },
        },
      });
      if (!m) return;
      await emitDomainEvent(
        {
          type: "message.sent",
          account: { kind: "whatsapp", id: m.chat.accountId },
          chat: { kind: "whatsapp", id: m.chat.id },
          contactId: m.chat.contactId,
          data: dataOf(m, origin),
        },
        opts.occurredAt,
        opts.emit
      );
      return;
    }
    const m = await prisma.channelMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        messageType: true,
        body: true,
        senderId: true,
        sender: { select: { name: true } },
        conversation: { select: { id: true, contactId: true, channelAccount: { select: { id: true, channel: true } } } },
      },
    });
    if (!m) return;
    await emitDomainEvent(
      {
        type: "message.sent",
        account: { kind: "channel", id: m.conversation.channelAccount.id, channel: m.conversation.channelAccount.channel },
        chat: { kind: "channel", id: m.conversation.id },
        contactId: m.conversation.contactId,
        data: dataOf(m, origin),
      },
      opts.occurredAt,
      opts.emit
    );
  } catch (err) {
    console.error("[events] message.sent falló:", err instanceof Error ? err.message : err);
  }
}

function dataOf(
  m: { id: string; messageType: string; body: string | null; senderId: string | null; sender: { name: string | null } | null },
  origin: OutboundOrigin
) {
  return {
    messageId: m.id,
    messageType: m.messageType,
    text: publicText(m.body, m.messageType),
    source: legacySourceOf(origin),
    senderId: m.senderId,
    origin,
    sentBy: sentByOf(origin, "OUTBOUND", m.senderId) ?? "system",
    senderName: m.sender?.name ?? null,
  };
}

// `message.updated`: mismo patrón (lee la fila guardada para armar las refs).
export async function emitMessageUpdated(kind: "whatsapp" | "channel", messageId: string, reason: "media_ready" | "history_media"): Promise<void> {
  try {
    if (kind === "whatsapp") {
      const m = await prisma.wAMessage.findUnique({
        where: { id: messageId },
        select: { origin: true, chat: { select: { id: true, accountId: true, contactId: true } } },
      });
      if (!m) return;
      await emitDomainEvent(
        {
          type: "message.updated",
          account: { kind: "whatsapp", id: m.chat.accountId },
          chat: { kind: "whatsapp", id: m.chat.id },
          contactId: m.chat.contactId,
          data: { messageId, reason },
        },
        new Date(),
        // El historial llega en ráfagas de miles: sus eventos no retrasan los en vivo.
        m.origin === "HISTORY" ? { priority: BACKGROUND_EVENT_PRIORITY } : {}
      );
      return;
    }
    const m = await prisma.channelMessage.findUnique({
      where: { id: messageId },
      select: { conversation: { select: { id: true, contactId: true, channelAccount: { select: { id: true, channel: true } } } } },
    });
    if (!m) return;
    await emitDomainEvent({
      type: "message.updated",
      account: { kind: "channel", id: m.conversation.channelAccount.id, channel: m.conversation.channelAccount.channel },
      chat: { kind: "channel", id: m.conversation.id },
      contactId: m.conversation.contactId,
      data: { messageId, reason },
    });
  } catch (err) {
    console.error("[events] message.updated falló:", err instanceof Error ? err.message : err);
  }
}
