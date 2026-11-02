import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";
import { maybeSendCsat } from "@/lib/csat/send-survey";
import { sendOutbound } from "@/lib/messaging/outbound";
import { type MacroAction, snoozeUntilForPreset } from "./types";
import { missingRequiredForChat, requiredFieldsMessage, REQUIRED_FIELDS_CODE } from "@/lib/chats/required-fields";

export { REQUIRED_FIELDS_CODE };

export class MacroNotFoundError extends Error {
  constructor() {
    super("Macro no encontrada");
    this.name = "MacroNotFoundError";
  }
}

// La macro resolvería el chat pero le faltan atributos obligatorios (F4). Se
// revisa ANTES de aplicar cualquier acción: nunca queda aplicada a medias.
export class MacroBlockedError extends Error {
  constructor(message: string, public fields: Array<{ key: string; label: string }>) {
    super(message);
    this.name = "MacroBlockedError";
  }
}

export async function runMacro(macro: { id: string; organizationId: string; actions: unknown }, chatId: string, userId: string): Promise<number> {
  const resolved = await resolveChatChannel(chatId, userId);
  if (!resolved) throw new MacroNotFoundError();

  const actions = Array.isArray(macro.actions) ? macro.actions as MacroAction[] : [];
  let applied = 0;

  if (actions.some((action) => action.type === "status" && action.status === "RESOLVED")) {
    const missing = await missingRequiredForChat(resolved.channel === "WHATSAPP" ? "whatsapp" : "channel", chatId);
    if (missing.length > 0) throw new MacroBlockedError(requiredFieldsMessage(missing), missing);
  }

  if (resolved.channel === "WHATSAPP") {
    const chat = await prisma.wAChat.findUnique({
      where: { id: chatId },
      include: { account: true },
    });
    if (!chat || chat.account.organizationId !== macro.organizationId) throw new MacroNotFoundError();

    for (const action of actions) {
      if (action.type === "assign_self") {
        await prisma.wAChat.update({ where: { id: chatId }, data: { assignedToId: userId } });
        const refs = await eventRefsForChat(chatId);
        if (refs) await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId: userId, auto: false } });
      } else if (action.type === "status") {
        const wasResolved = chat.status === "RESOLVED";
        await prisma.wAChat.update({
          where: { id: chatId },
          data: {
            status: action.status,
            resolvedAt: action.status === "RESOLVED" ? new Date() : null,
            ...(action.status === "RESOLVED" ? { waitingSince: null } : {}),
          },
        });
        if (action.status === "RESOLVED" && !wasResolved) {
          const refs = await eventRefsForChat(chatId);
          if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });
          await maybeSendCsat(chatId).catch((error) => console.error("[macros] CSAT no enviado", error));
        }
      } else if (action.type === "priority") {
        await prisma.wAChat.update({ where: { id: chatId }, data: { priority: action.priority } });
      } else if (action.type === "snooze") {
        await prisma.wAChat.update({ where: { id: chatId }, data: { snoozedUntil: snoozeUntilForPreset(action.preset) } });
      } else if (action.type === "send_message") {
        await sendOutbound(
          { kind: "whatsapp", chat },
          { type: "text", text: action.body },
          { source: "automation", senderId: userId }
        );
      }
      applied++;
    }
    return applied;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: chatId },
    include: { channelAccount: true },
  });
  if (!conversation || conversation.channelAccount.organizationId !== macro.organizationId) throw new MacroNotFoundError();

  for (const action of actions) {
    if (action.type === "assign_self") {
      await prisma.conversation.update({ where: { id: chatId }, data: { assignedToId: userId } });
      const refs = await eventRefsForChat(chatId);
      if (refs) await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId: userId, auto: false } });
    } else if (action.type === "status") {
      const wasResolved = conversation.status === "RESOLVED";
      await prisma.conversation.update({
        where: { id: chatId },
        data: {
            status: action.status,
            resolvedAt: action.status === "RESOLVED" ? new Date() : null,
            ...(action.status === "RESOLVED" ? { waitingSince: null } : {}),
          },
      });
      if (action.status === "RESOLVED" && !wasResolved) {
        const refs = await eventRefsForChat(chatId);
        if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });
      }
    } else if (action.type === "priority") {
      await prisma.conversation.update({ where: { id: chatId }, data: { priority: action.priority } });
    } else if (action.type === "snooze") {
      await prisma.conversation.update({ where: { id: chatId }, data: { snoozedUntil: snoozeUntilForPreset(action.preset) } });
    } else if (action.type === "send_message") {
      await sendOutbound(
        { kind: "channel", conversation },
        { type: "text", text: action.body },
        { source: "automation", senderId: userId }
      );
    }
    applied++;
  }
  return applied;
}
