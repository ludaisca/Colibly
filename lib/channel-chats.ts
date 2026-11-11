import type { Channel } from "@prisma/client";
import { teamFilterIds } from "@/lib/teams/teams";
import { prisma } from "@/lib/prisma";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { buildChannelChatWhere, CHANNEL_CHAT_SELECT, mapChannelChatRow, parseChatListFilters, chatListOrderBy } from "@/lib/chats/query";

// Lógica compartida por GET /api/{telegram,messenger,instagram}/chats —
// mismo shape de respuesta que GET /api/whatsapp/chats (paginado, {items,
// total, page, pageSize}) para que chat-workspace.tsx pueda mezclar todas
// las fuentes sin normalizar formatos distintos. Alcance: cuentas propias +
// compartidas (ChannelAccountShare), igual que getUserAccountIds() en WhatsApp.
export type ChannelChatsResult =
  | { ok: true; paginate: boolean; data: unknown }
  | { ok: false; status: number; error: string };

export async function listChannelChats(userId: string, channel: Channel, searchParams: URLSearchParams): Promise<ChannelChatsResult> {
  const accountId = searchParams.get("accountId");
  const channelAccountIds = await getUserChannelAccountIds(userId);

  if (accountId) {
    // channel es obligatorio en este where — sin él, pasarle el accountId de
    // una cuenta de OTRO canal del mismo usuario devolvería 200 en vez de 404.
    const owned = await prisma.channelAccount.findFirst({
      where: { id: accountId, channel, AND: [{ id: { in: channelAccountIds } }] },
      select: { id: true },
    });
    if (!owned) {
      return { ok: false, status: 404, error: "Cuenta no encontrada" };
    }
  }

  const filters = parseChatListFilters(searchParams, userId);
  filters.teamIds = await teamFilterIds(searchParams.get("team"), userId);
  const pageParam = searchParams.get("page");
  const paginate = pageParam !== null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 30, 1), 100);
  const where = buildChannelChatWhere(filters, channelAccountIds, channel);

  // Una campaña solo existe en WhatsApp; el cliente ya omite estas fuentes,
  // pero la API también responde vacío si alguien la pide directamente.
  if (!where) {
    return { ok: true, paginate, data: paginate ? { items: [], total: 0, page, pageSize } : [] };
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: CHANNEL_CHAT_SELECT,
      orderBy: chatListOrderBy(filters),
      ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paginate ? prisma.conversation.count({ where }) : Promise.resolve(null),
  ]);

  const chats = rows.map(mapChannelChatRow);

  return {
    ok: true,
    paginate,
    data: paginate ? { items: chats, total, page, pageSize } : chats,
  };
}
