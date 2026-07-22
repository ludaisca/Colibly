import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mismo shape de respuesta que GET /api/whatsapp/chats (paginado, {items,
// total, page, pageSize}) para que chat-workspace.tsx pueda mezclar ambas
// fuentes sin normalizar dos formatos distintos. Sin WAAccountShare
// equivalente todavía — se filtra directo por channelAccount.userId.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");

    if (accountId) {
      const owned = await prisma.channelAccount.findFirst({
        where: { id: accountId, userId: session.user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    }

    const where: Record<string, unknown> = {
      channelAccount: { userId: session.user.id },
      ...(accountId ? { channelAccountId: accountId } : {}),
    };

    const search = searchParams.get("search")?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { externalId: { contains: search } },
        { lastMessage: { contains: search, mode: "insensitive" } },
      ];
    }

    const statusParam = searchParams.get("status");
    if (statusParam) {
      const statuses = statusParam.split(",").filter((s) => ["OPEN", "PENDING", "RESOLVED"].includes(s));
      if (statuses.length > 0) where.status = { in: statuses };
    }

    // hasReplied: sin campañas en Telegram, "yes" es simplemente cualquier
    // conversación con al menos un mensaje INBOUND — mismo criterio que
    // WhatsApp, solo sin el filtro adicional de campaignId (fuera de alcance).
    const hasRepliedParam = searchParams.get("hasReplied");
    if (hasRepliedParam === "yes") {
      where.messages = { some: { direction: "INBOUND" } };
    } else if (hasRepliedParam === "no") {
      where.messages = { none: { direction: "INBOUND" } };
    }

    const pageParam = searchParams.get("page");
    const paginate = pageParam !== null;
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 30, 1), 100);

    const select = {
      id: true,
      channelAccountId: true,
      externalId: true,
      name: true,
      isGroup: true,
      lastMessage: true,
      lastMessageAt: true,
      unreadCount: true,
      contactId: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
      channelAccount: { select: { id: true, name: true } },
    } as const;

    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        select,
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      paginate ? prisma.conversation.count({ where }) : Promise.resolve(null),
    ]);

    // Shape idéntico a /api/whatsapp/chats: remoteJid/accountId/isGroup/account
    // en vez de externalId/channelAccountId/channelAccount, más un discriminador
    // channel y campaign siempre null (las campañas no existen en Telegram).
    const chats = rows.map((c) => ({
      id: c.id,
      accountId: c.channelAccountId,
      remoteJid: c.externalId,
      name: c.name,
      isGroup: c.isGroup,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      contactId: c.contactId,
      status: c.status,
      assignedToId: c.assignedToId,
      assignedTo: c.assignedTo,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      account: { id: c.channelAccount.id, name: c.channelAccount.name, phoneNumber: null },
      campaign: null,
      channel: "TELEGRAM" as const,
    }));

    if (paginate) {
      return NextResponse.json({ items: chats, total, page, pageSize });
    }
    return NextResponse.json(chats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
