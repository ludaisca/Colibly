import { NextResponse } from "next/server";
import { teamFilterIds } from "@/lib/teams/teams";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import {
  buildChannelChatWhere,
  buildWaChatWhere,
  CHANNEL_CHAT_SELECT,
  mapChannelChatRow,
  mapWaChatRow,
  parseChatListFilters, chatListOrderBy, chatRowComparator,
  WA_CHAT_SELECT,
} from "@/lib/chats/query";
import { loadLatestMessages, type ChatChannel } from "@/lib/chats/messages";
import { getViewCountsCached } from "@/lib/chats/counts";
import { getTypingUsers } from "@/lib/typing";
import { jsonWithEtag } from "@/lib/http/etag";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

// Sincronización de la bandeja en UNA petición (R1 de
// docs/RENDIMIENTO_2026-11-04.md; el equivalente con polling del canal único
// de Chatwoot). Sustituye los sondeos separados de la lista de cada canal,
// los mensajes del chat abierto, "está escribiendo" y los contadores de vistas.
//
// Parámetros: los mismos filtros que la lista (lib/chats/query.ts) más
//   since    updatedAt más reciente que el cliente ya tiene (ISO). Con él solo
//            vuelven los chats modificados desde entonces; sin él, la primera página.
//   floor    lastMessageAt del chat más antiguo que el cliente tiene cargado.
//            El delta se limita a chats de ahí hacia arriba: un chat modificado
//            más abajo (una asignación masiva, p. ej.) no está en pantalla y
//            meterlo descuadraría la paginación por canal de "Cargar más".
//            Un chat con mensaje nuevo sube arriba, así que siempre entra.
//   thread   id del chat abierto: añade sus últimos 50 mensajes y quién escribe
//            (no `chatId`, que en la lista es un filtro por id).
//   threadSince timestamp del mensaje desde el que el cliente quiere el hilo
//            (el 20.º más reciente que tiene): vuelven ese y todos los
//            posteriores, no los últimos 50 en cada tick.
//   counts=1 añade los contadores de las vistas rápidas.
//
// El cursor lo deriva el cliente de sus propios chats, así que si nada cambió
// la respuesta es idéntica y jsonWithEtag() contesta 304 sin cuerpo. La
// ventana se solapa unos segundos con `since` para no perder una escritura
// que se confirmó tarde; el cliente fusiona por id, así que repetir es inocuo.
const OVERLAP_MS = 3_000;
const DELTA_MAX = 100;
const MESSAGES_LIMIT = 50;
const THREAD_SINCE_MAX = 100;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const userId = session.user.id;

    // 5 s por pestaña = 12/min; el margen cubre varias pestañas abiertas.
    const { allowed } = await rateLimit(`inbox-sync:${userId}`, 120, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const { searchParams } = new URL(req.url);
    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(userId),
      getUserChannelAccountIds(userId),
    ]);

    const filters = parseChatListFilters(searchParams, userId);
    filters.teamIds = await teamFilterIds(searchParams.get("team"), userId);
    if (filters.accountId && !accountIds.includes(filters.accountId) && !channelAccountIds.includes(filters.accountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const sinceParam = searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : null;
    if (since && isNaN(since.getTime())) {
      return NextResponse.json({ error: "Parámetro 'since' inválido" }, { status: 400 });
    }
    const floorParam = searchParams.get("floor");
    const floor = floorParam ? new Date(floorParam) : null;
    if (floor && isNaN(floor.getTime())) {
      return NextResponse.json({ error: "Parámetro 'floor' inválido" }, { status: 400 });
    }
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 30, 1), 100);

    // Un filtro de cuenta apunta a un solo stack: el otro no se consulta.
    const waWhere = accountIds.length && (!filters.accountId || accountIds.includes(filters.accountId))
      ? buildWaChatWhere(filters, accountIds)
      : null;
    const channelWhere = channelAccountIds.length && (!filters.accountId || channelAccountIds.includes(filters.accountId))
      ? buildChannelChatWhere(filters, channelAccountIds)
      : null;
    const window = since
      ? { updatedAt: { gt: new Date(since.getTime() - OVERLAP_MS) }, ...(floor ? { lastMessageAt: { gte: floor } } : {}) }
      : {};
    const take = since ? DELTA_MAX : pageSize;
    // Mismo orden que la lista (espera / más antiguos / recientes).
    const orderBy = chatListOrderBy(filters);

    const [waRows, channelRows] = await Promise.all([
      waWhere ? prisma.wAChat.findMany({ where: { AND: [waWhere, window] }, select: WA_CHAT_SELECT, orderBy, take }) : [],
      channelWhere ? prisma.conversation.findMany({ where: { AND: [channelWhere, window] }, select: CHANNEL_CHAT_SELECT, orderBy, take }) : [],
    ]);
    const chats = [...waRows.map(mapWaChatRow), ...channelRows.map(mapChannelChatRow)].sort(
      chatRowComparator(filters)
    );

    // El total (para "Cargar más") solo se recalcula si algo cambió de verdad,
    // no por los chats que repite la ventana de solape.
    const changed = !since || chats.some((chat) => chat.updatedAt > since);
    let total: number | undefined;
    if (changed) {
      const [wa, channel] = await Promise.all([
        waWhere ? prisma.wAChat.count({ where: waWhere }) : 0,
        channelWhere ? prisma.conversation.count({ where: channelWhere }) : 0,
      ]);
      total = wa + channel;
    }

    // Chat abierto: mismo alcance que resolveChatChannel(), con los ids ya resueltos.
    let thread: { chatId: string; messages: unknown[]; typing: Array<{ id: string; name: string | null }> } | { chatId: string; missing: true } | undefined;
    const chatId = searchParams.get("thread");
    const threadSinceParam = searchParams.get("threadSince");
    const threadSince = threadSinceParam ? new Date(threadSinceParam) : null;
    if (threadSince && isNaN(threadSince.getTime())) {
      return NextResponse.json({ error: "Parámetro 'threadSince' inválido" }, { status: 400 });
    }
    if (chatId) {
      let channel: ChatChannel | null = null;
      if (accountIds.length && await prisma.wAChat.findFirst({ where: { id: chatId, accountId: { in: accountIds } }, select: { id: true } })) {
        channel = "WHATSAPP";
      } else if (channelAccountIds.length) {
        const conversation = await prisma.conversation.findFirst({
          where: { id: chatId, channelAccountId: { in: channelAccountIds } },
          select: { channelAccount: { select: { channel: true } } },
        });
        if (conversation) channel = conversation.channelAccount.channel;
      }
      if (channel) {
        const [messages, typing] = await Promise.all([
          loadLatestMessages(chatId, channel, { limit: threadSince ? THREAD_SINCE_MAX : MESSAGES_LIMIT, since: threadSince ?? undefined }),
          getTypingUsers(chatId, userId),
        ]);
        thread = { chatId, messages, typing };
      } else {
        thread = { chatId, missing: true };
      }
    }

    const counts = searchParams.get("counts") === "1"
      ? await getViewCountsCached(userId, accountIds, channelAccountIds)
      : undefined;

    return jsonWithEtag(req, { chats, total, thread, counts });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
