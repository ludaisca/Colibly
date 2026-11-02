import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { buildChannelChatWhere, buildWaChatWhere, parseChatListFilters } from "@/lib/chats/query";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

// Contadores de las vistas rápidas de la bandeja (U4): chats activos —abiertos
// o pendientes y sin posponer— de todas las cuentas del usuario, en WhatsApp y
// en los canales genéricos. Usa los mismos builders que la lista
// (lib/chats/query.ts), así el número coincide con lo que se ve al aplicar la
// vista. No hay pestañas en la cabecera: los números viven en el menú de vistas.
const VIEWS = {
  awaiting: "awaiting=1",
  mine: "assigned=me",
  unassigned: "assigned=unassigned",
  all: "",
} as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { allowed } = await rateLimit(`chat-counts:${session.user.id}`, 60, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const entries = await Promise.all(
      Object.entries(VIEWS).map(async ([key, query]) => {
        const filters = parseChatListFilters(new URLSearchParams(`status=OPEN,PENDING&${query}`), session.user.id);
        const channelWhere = buildChannelChatWhere(filters, channelAccountIds);
        const [wa, channel] = await Promise.all([
          accountIds.length ? prisma.wAChat.count({ where: buildWaChatWhere(filters, accountIds) }) : 0,
          channelAccountIds.length && channelWhere ? prisma.conversation.count({ where: channelWhere }) : 0,
        ]);
        return [key, wa + channel] as const;
      })
    );

    return NextResponse.json(Object.fromEntries(entries), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
