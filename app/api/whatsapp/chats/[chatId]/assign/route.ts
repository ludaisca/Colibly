import { NextResponse } from "next/server";
import { displayName } from "@/lib/chats/display-name";
import { queuePush } from "@/lib/notifications/push";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";

const ASSIGNEE_SELECT = {
  id: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    // `self: true` es el atajo de "Asignarme": evita que el cliente tenga que
    // conocer su propio id y hace explícita la intención en la API.
    const assignedToId: string | null = body?.self === true ? session.user.id : (body?.assignedToId ?? null);

    if (resolved.channel !== "WHATSAPP") {
      // Dueño de la cuenta + usuarios con ChannelAccountShare (activos).
      const conversation = await prisma.conversation.findUnique({
        where: { id: chatId },
        select: {
          channelAccountId: true,
          assignedToId: true,
          name: true,
          externalId: true,
          contact: { select: { name: true } },
        },
      });
      if (assignedToId !== null) {
        const eligible = conversation ? await getEligibleChannelAssignees(conversation.channelAccountId) : [];
        if (!eligible.some((u) => u.id === assignedToId)) {
          return NextResponse.json({ error: "Usuario no válido para esta cuenta" }, { status: 400 });
        }
      }
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: { assignedToId },
        select: ASSIGNEE_SELECT,
      });
      await emitAssigned(chatId, assignedToId);
      if (conversation && conversation.assignedToId !== assignedToId) {
        await notifyAssignment({
          assignedToId,
          actorId: session.user.id,
          accountId: conversation.channelAccountId,
          chatId,
          contactName: displayName(conversation.contact?.name ?? conversation.name, conversation.externalId),
        });
      }
      return NextResponse.json(updated);
    }

    const chat = await prisma.wAChat.findFirst({
      where: { id: chatId, accountId: { in: resolved.accountIds } },
      select: {
        accountId: true,
        assignedToId: true,
        name: true,
        remoteJid: true,
        contact: { select: { name: true } },
      },
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    if (assignedToId !== null) {
      const eligible = await getEligibleAssignees(chat.accountId);
      if (!eligible.some((a) => a.id === assignedToId)) {
        return NextResponse.json({ error: "Usuario no válido para esta cuenta" }, { status: 400 });
      }
    }

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: { assignedToId },
      select: ASSIGNEE_SELECT,
    });
    await emitAssigned(chatId, assignedToId);
    if (chat.assignedToId !== assignedToId) {
      await notifyAssignment({
        assignedToId,
        actorId: session.user.id,
        accountId: chat.accountId,
        chatId,
        contactName: displayName(chat.contact?.name ?? chat.name, chat.remoteJid),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function emitAssigned(chatId: string, assignedToId: string | null) {
  const refs = await eventRefsForChat(chatId);
  if (refs) await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId, auto: false } });
}

// La asignación ya se guardó cuando llegamos aquí: un fallo al crear el aviso
// no debe convertir la respuesta en un 500 (el cliente reintentaría y el chat
// quedaría igual). Se registra y se sigue.
async function notifyAssignment(input: {
  assignedToId: string | null;
  actorId: string;
  accountId: string;
  chatId: string;
  contactName: string;
}): Promise<void> {
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
