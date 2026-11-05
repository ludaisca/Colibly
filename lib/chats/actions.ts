import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/chats/display-name";
import { queuePush } from "@/lib/notifications/push";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";
import { maybeSendCsat } from "@/lib/csat/send-survey";
import { missingRequiredForChat, requiredFieldsMessage } from "@/lib/chats/required-fields";

// Cambiar el estado y la asignación de un chat (WAChat o Conversation). Un solo
// lugar para la bandeja (/api/whatsapp/chats/[chatId]/{status,assign}) y la API
// pública (PATCH /api/v1/conversations/{id}): mismos efectos — atributos
// obligatorios, waitingSince, CSAT, eventos de dominio y aviso al asignado.
// Quien llama ya validó que el chat está al alcance de la persona o la key.

export type ChatKind = "whatsapp" | "channel";
export const CHAT_STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;
export type ChatStatusValue = (typeof CHAT_STATUSES)[number];

export class ChatActionError extends Error {
  constructor(
    public readonly code: "invalid_assignee" | "required_fields",
    message: string,
    public readonly fields?: unknown
  ) {
    super(message);
  }
}

export async function setChatStatus(kind: ChatKind, chatId: string, status: ChatStatusValue) {
  // Atributos de conversación obligatorios (F4): no se resuelve con huecos.
  if (status === "RESOLVED") {
    const missing = await missingRequiredForChat(kind, chatId);
    if (missing.length > 0) throw new ChatActionError("required_fields", requiredFieldsMessage(missing), missing);
  }
  const willBeResolved = status === "RESOLVED";
  const select = { id: true, status: true, resolvedAt: true } as const;

  let wasResolved: boolean;
  let updated: { id: string; status: string; resolvedAt: Date | null };
  if (kind === "channel") {
    const current = await prisma.conversation.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
    wasResolved = current.status === "RESOLVED";
    updated = await prisma.conversation.update({
      where: { id: chatId },
      data: {
        status,
        resolvedAt: willBeResolved ? new Date() : wasResolved ? null : undefined,
        // Un chat resuelto no espera respuesta (lib/chats/waiting.ts).
        ...(willBeResolved ? { waitingSince: null } : {}),
      },
      select,
    });
  } else {
    const current = await prisma.wAChat.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
    wasResolved = current.status === "RESOLVED";
    updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: {
        status,
        resolvedAt: willBeResolved ? new Date() : wasResolved ? null : undefined,
        ...(willBeResolved ? { waitingSince: null } : {}),
      },
      select,
    });
  }

  if (willBeResolved && !wasResolved) {
    const refs = await eventRefsForChat(chatId);
    if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });
    // La encuesta es best-effort (solo WhatsApp): resolver nunca falla por un
    // envío que Meta rechace.
    if (kind === "whatsapp") await maybeSendCsat(chatId).catch((error) => console.error("[csat] no se pudo enviar la encuesta", error));
  }
  return updated;
}

const ASSIGNEE_SELECT = {
  id: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

/** `actorId`: quien asigna (no se avisa a sí mismo). Lanza `invalid_assignee` si la persona no puede atender esa cuenta. */
export async function assignChat(kind: ChatKind, chatId: string, assignedToId: string | null, actorId: string) {
  const before =
    kind === "channel"
      ? await prisma.conversation
          .findUniqueOrThrow({ where: { id: chatId }, select: { channelAccountId: true, assignedToId: true, name: true, externalId: true, contact: { select: { name: true } } } })
          .then((c) => ({ accountId: c.channelAccountId, assignedToId: c.assignedToId, contactName: displayName(c.contact?.name ?? c.name, c.externalId) }))
      : await prisma.wAChat
          .findUniqueOrThrow({ where: { id: chatId }, select: { accountId: true, assignedToId: true, name: true, remoteJid: true, contact: { select: { name: true } } } })
          .then((c) => ({ accountId: c.accountId, assignedToId: c.assignedToId, contactName: displayName(c.contact?.name ?? c.name, c.remoteJid) }));

  if (assignedToId !== null) {
    const eligible = kind === "channel" ? await getEligibleChannelAssignees(before.accountId) : await getEligibleAssignees(before.accountId);
    if (!eligible.some((u) => u.id === assignedToId)) throw new ChatActionError("invalid_assignee", "Usuario no válido para esta cuenta");
  }

  const updated =
    kind === "channel"
      ? await prisma.conversation.update({ where: { id: chatId }, data: { assignedToId }, select: ASSIGNEE_SELECT })
      : await prisma.wAChat.update({ where: { id: chatId }, data: { assignedToId }, select: ASSIGNEE_SELECT });

  const refs = await eventRefsForChat(chatId);
  if (refs) await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId, auto: false } });
  if (before.assignedToId !== assignedToId) {
    await notifyAssignment({ assignedToId, actorId, accountId: before.accountId, chatId, contactName: before.contactName });
  }
  return updated;
}

// La asignación ya se guardó cuando llegamos aquí: un fallo al crear el aviso
// no debe convertir la respuesta en un 500 (el cliente reintentaría y el chat
// quedaría igual). Se registra y se sigue.
async function notifyAssignment(input: { assignedToId: string | null; actorId: string; accountId: string; chatId: string; contactName: string }): Promise<void> {
  if (!input.assignedToId || input.assignedToId === input.actorId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.assignedToId,
        type: "CHAT_ASSIGNED",
        title: "Chat asignado",
        body: input.contactName.slice(0, 200),
        link: `/whatsapp/chat/${input.accountId}/${input.chatId}`,
      },
    });
    await queuePush(input.assignedToId, { title: "Chat asignado", body: input.contactName, link: `/whatsapp/chat/${input.accountId}/${input.chatId}`, tag: `chat:${input.chatId}` });
  } catch (error) {
    console.error("[chats] no se pudo crear la notificación de asignación", error);
  }
}
