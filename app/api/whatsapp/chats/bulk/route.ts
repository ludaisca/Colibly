import { NextResponse } from "next/server";
import { chatsMissingRequired } from "@/lib/chats/required-fields";
import { queuePush } from "@/lib/notifications/push";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";

const MAX_CHATS = 100;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const MAX_SNOOZE_DAYS = 30;

type BulkAction =
  | { type: "assign"; assignedToId?: string | null; self?: boolean }
  | { type: "status"; status: "OPEN" | "RESOLVED" }
  | { type: "priority"; priority: (typeof PRIORITIES)[number] }
  | { type: "snooze"; until: string | null };

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const chatIds = Array.isArray(body?.chatIds)
      ? Array.from(new Set((body.chatIds as unknown[]).filter((id): id is string => typeof id === "string")))
      : [];
    const action = body?.action as BulkAction | undefined;

    if (chatIds.length === 0 || chatIds.length > MAX_CHATS) {
      return NextResponse.json({ error: `Selecciona entre 1 y ${MAX_CHATS} chats` }, { status: 400 });
    }
    if (!action || typeof action.type !== "string") {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    const [waAccountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const [waChats, conversations] = await Promise.all([
      prisma.wAChat.findMany({
        where: { id: { in: chatIds }, accountId: { in: waAccountIds } },
        select: { id: true, accountId: true, status: true, assignedToId: true, customFields: true },
      }),
      prisma.conversation.findMany({
        where: { id: { in: chatIds }, channelAccountId: { in: channelAccountIds } },
        select: { id: true, channelAccountId: true, status: true, assignedToId: true, customFields: true },
      }),
    ]);

    if (waChats.length + conversations.length !== chatIds.length) {
      // No se revela cuál id quedó fuera del alcance.
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    let waIds = waChats.map((c) => c.id);
    let channelIds = conversations.map((c) => c.id);
    // Resolver en lote salta los chats con atributos obligatorios vacíos (F4)
    // y los reporta como `skipped`; el resto sí se resuelve.
    let skippedRequired = 0;
    if (action.type === "status" && action.status === "RESOLVED") {
      const [blockedWa, blockedCh] = await Promise.all([
        chatsMissingRequired("whatsapp", waChats.filter((c) => c.status !== "RESOLVED")),
        chatsMissingRequired("channel", conversations.filter((c) => c.status !== "RESOLVED").map((c) => ({ ...c, accountId: c.channelAccountId }))),
      ]);
      skippedRequired = blockedWa.size + blockedCh.size;
      waIds = waIds.filter((id) => !blockedWa.has(id));
      channelIds = channelIds.filter((id) => !blockedCh.has(id));
    }

    if (action.type === "assign") {
      const target = action.self === true ? session.user.id : (action.assignedToId ?? null);
      if (target) {
        const waAccounts = Array.from(new Set(waChats.map((c) => c.accountId)));
        const channelAccounts = Array.from(new Set(conversations.map((c) => c.channelAccountId)));
        const eligibleLists = await Promise.all([
          ...waAccounts.map((id) => getEligibleAssignees(id)),
          ...channelAccounts.map((id) => getEligibleChannelAssignees(id)),
        ]);
        if (!eligibleLists.every((list) => list.some((user) => user.id === target))) {
          return NextResponse.json({ error: "Usuario no válido para una de las cuentas" }, { status: 400 });
        }
      }

      const [waUpdated, channelUpdated] = await Promise.all([
        waIds.length ? prisma.wAChat.updateMany({ where: { id: { in: waIds } }, data: { assignedToId: target } }) : { count: 0 },
        channelIds.length ? prisma.conversation.updateMany({ where: { id: { in: channelIds } }, data: { assignedToId: target } }) : { count: 0 },
      ]);

      const changedWa = waChats.filter((c) => c.assignedToId !== target).map((c) => c.id);
      const changedChannel = conversations.filter((c) => c.assignedToId !== target).map((c) => c.id);
      await Promise.all([...changedWa, ...changedChannel].map((id) => emitAssigned(id, target)));
      if (target && target !== session.user.id && changedWa.length + changedChannel.length > 0) {
        await notifyBulkAssignment(target, changedWa.length + changedChannel.length);
      }

      return NextResponse.json({ updated: waUpdated.count + channelUpdated.count });
    }

    if (action.type === "status") {
      if (action.status !== "OPEN" && action.status !== "RESOLVED") {
        return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
      }
      const now = new Date();
      const [waUpdated, channelUpdated] = await Promise.all([
        waIds.length
          ? action.status === "RESOLVED"
            ? prisma.wAChat.updateMany({ where: { id: { in: waIds } }, data: { status: "RESOLVED", resolvedAt: now, waitingSince: null } })
            : reopenMany("whatsapp", waIds, now)
          : { count: 0 },
        channelIds.length
          ? action.status === "RESOLVED"
            ? prisma.conversation.updateMany({ where: { id: { in: channelIds } }, data: { status: "RESOLVED", resolvedAt: now, waitingSince: null } })
            : reopenMany("channel", channelIds, now)
          : { count: 0 },
      ]);

      if (action.status === "RESOLVED") {
        const resolvedIds = [
          ...waChats.filter((c) => c.status !== "RESOLVED" && waIds.includes(c.id)).map((c) => c.id),
          ...conversations.filter((c) => c.status !== "RESOLVED" && channelIds.includes(c.id)).map((c) => c.id),
        ];
        await Promise.all(resolvedIds.map((id) => emitResolved(id)));
      }

      return NextResponse.json({ updated: waUpdated.count + channelUpdated.count, skipped: skippedRequired });
    }

    if (action.type === "priority") {
      if (!PRIORITIES.includes(action.priority)) {
        return NextResponse.json({ error: "Prioridad no válida" }, { status: 400 });
      }
      const [waUpdated, channelUpdated] = await Promise.all([
        waIds.length ? prisma.wAChat.updateMany({ where: { id: { in: waIds } }, data: { priority: action.priority } }) : { count: 0 },
        channelIds.length ? prisma.conversation.updateMany({ where: { id: { in: channelIds } }, data: { priority: action.priority } }) : { count: 0 },
      ]);
      return NextResponse.json({ updated: waUpdated.count + channelUpdated.count });
    }

    if (action.type === "snooze") {
      let until: Date | null = null;
      if (action.until !== null) {
        const parsed = new Date(action.until);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
        }
        const max = Date.now() + MAX_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
        if (parsed.getTime() <= Date.now() || parsed.getTime() > max) {
          return NextResponse.json({ error: `La fecha debe ser futura y menor a ${MAX_SNOOZE_DAYS} días` }, { status: 400 });
        }
        until = parsed;
      }
      const [waUpdated, channelUpdated] = await Promise.all([
        waIds.length ? prisma.wAChat.updateMany({ where: { id: { in: waIds } }, data: { snoozedUntil: until } }) : { count: 0 },
        channelIds.length ? prisma.conversation.updateMany({ where: { id: { in: channelIds } }, data: { snoozedUntil: until } }) : { count: 0 },
      ]);
      return NextResponse.json({ updated: waUpdated.count + channelUpdated.count });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function emitAssigned(chatId: string, assignedToId: string | null) {
  const refs = await eventRefsForChat(chatId);
  if (refs) await emitDomainEvent({ type: "conversation.assigned", ...refs, data: { assignedToId, auto: false } });
}

async function emitResolved(chatId: string) {
  const refs = await eventRefsForChat(chatId);
  if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });
}

async function notifyBulkAssignment(userId: string, count: number) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: "CHAT_ASSIGNED",
        title: "Chats asignados",
        body: `${count} conversación${count === 1 ? "" : "es"} asignada${count === 1 ? "" : "s"}`,
        link: "/whatsapp/chat?assigned=me",
      },
    });
    await queuePush(userId, {
      title: "Chats asignados",
      body: `${count} conversación${count === 1 ? "" : "es"} asignada${count === 1 ? "" : "s"}`,
      link: "/whatsapp/chat?assigned=me",
    });
  } catch (error) {
    console.error("[chats] no se pudo crear la notificación de asignación masiva", error);
  }
}

// Reabrir en lote: solo los RESUELTOS empiezan otro ciclo (openedAt, reloj de
// resolución del SLA); un PENDING que pasa a OPEN sigue en el mismo ciclo.
async function reopenMany(kind: "whatsapp" | "channel", ids: string[], now: Date): Promise<{ count: number }> {
  const [resolved, others] =
    kind === "whatsapp"
      ? await Promise.all([
          prisma.wAChat.updateMany({ where: { id: { in: ids }, status: "RESOLVED" }, data: { status: "OPEN", resolvedAt: null, openedAt: now } }),
          prisma.wAChat.updateMany({ where: { id: { in: ids }, status: { not: "RESOLVED" } }, data: { status: "OPEN", resolvedAt: null } }),
        ])
      : await Promise.all([
          prisma.conversation.updateMany({ where: { id: { in: ids }, status: "RESOLVED" }, data: { status: "OPEN", resolvedAt: null, openedAt: now } }),
          prisma.conversation.updateMany({ where: { id: { in: ids }, status: { not: "RESOLVED" } }, data: { status: "OPEN", resolvedAt: null } }),
        ]);
  return { count: resolved.count + others.count };
}
