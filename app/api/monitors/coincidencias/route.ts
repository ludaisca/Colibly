import { displayName } from "@/lib/chats/display-name";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { monitorSession } from "../_shared";

// Últimas coincidencias (opcionalmente de un monitor), con el nombre del chat
// y su enlace. Solo de monitores de la propia organización.
export async function GET(req: Request) {
  try {
    const ctx = await monitorSession();
    if (ctx instanceof NextResponse) return ctx;
    const monitorId = new URL(req.url).searchParams.get("monitorId");
    const matches = await prisma.topicMatch.findMany({
      where: { monitor: { organizationId: ctx.organizationId }, ...(monitorId ? { monitorId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, monitorId: true, chatKind: true, chatId: true, accountId: true, quote: true, createdAt: true, monitor: { select: { name: true } } },
    });
    const waIds = matches.filter((m) => m.chatKind === "whatsapp").map((m) => m.chatId);
    const chIds = matches.filter((m) => m.chatKind === "channel").map((m) => m.chatId);
    const [waChats, conversations] = await Promise.all([
      waIds.length ? prisma.wAChat.findMany({ where: { id: { in: waIds } }, select: { id: true, name: true, remoteJid: true } }) : [],
      chIds.length ? prisma.conversation.findMany({ where: { id: { in: chIds } }, select: { id: true, name: true, externalId: true } }) : [],
    ]);
    const names = new Map<string, string>([
      ...waChats.map((c) => [c.id, c.name ?? c.remoteJid] as [string, string]),
      ...conversations.map((c) => [c.id, displayName(c.name, c.externalId)] as [string, string]),
    ]);
    return NextResponse.json(
      matches.map(({ monitor, ...match }) => ({
        ...match,
        monitorName: monitor.name,
        chatName: names.get(match.chatId) ?? null,
        // El chat pudo borrarse: sin enlace.
        href: names.has(match.chatId) ? `/whatsapp/chat/${match.accountId}/${match.chatId}` : null,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
