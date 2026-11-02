import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { touchLastSeen } from "@/lib/users/availability";
import { chatRefFromLink, readableNotificationText } from "@/lib/notifications/present";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Latido de presencia (sin websockets): la campana consulta esta ruta
    // cada ~25 s mientras la app está abierta.
    await touchLastSeen(session.user.id);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          read: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    ]);

    // Avisos de un chat: cuenta y canal para dibujar el avatar con la
    // insignia. Los ids vienen de enlaces que generó el servidor para este
    // usuario; la consulta solo devuelve el tipo de canal.
    const accountIds = [...new Set(items.map((n) => chatRefFromLink(n.link)?.accountId).filter((id): id is string => !!id))];
    const channelById = new Map<string, string>();
    if (accountIds.length > 0) {
      const [wa, channels] = await Promise.all([
        prisma.wAAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true } }),
        prisma.channelAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, channel: true } }),
      ]);
      for (const a of wa) channelById.set(a.id, "WHATSAPP");
      for (const a of channels) channelById.set(a.id, a.channel);
    }

    return NextResponse.json({
      items: items.map((n) => {
        const ref = chatRefFromLink(n.link);
        const channel = ref ? channelById.get(ref.accountId) : undefined;
        return {
          ...n,
          title: readableNotificationText(n.title),
          body: readableNotificationText(n.body),
          chat: ref && channel ? { accountId: ref.accountId, channel } : null,
        };
      }),
      unreadCount,
    });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
