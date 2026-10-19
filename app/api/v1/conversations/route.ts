import type { ChatStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, enforceLimit } from "@/lib/api/auth";
import { API_CONVERSATIONS_LIST_PER_MINUTE } from "@/lib/api/constants";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { serializeConversation } from "@/lib/api/resources";

const STATUSES: ChatStatus[] = ["OPEN", "PENDING", "RESOLVED"];
const CHANNELS = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"] as const;

// GET /api/v1/conversations — WhatsApp y demás canales en una sola lista,
// ordenada por último mensaje. Las dos tablas se paginan con el mismo cursor
// (lastMessageAt, id): cada página pide `limit` a cada una, mezcla y corta, así
// el orden global es exacto. Conversaciones sin ningún mensaje no se listan.
// Filtros: accountId, channel, status, assignedToId, contactId.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  // El listado más caro de la API (mezcla WhatsApp + otros canales): límite propio por key.
  await enforceLimit(req, "endpoint", `api-conv-list:${ctx.keyId}`, API_CONVERSATIONS_LIST_PER_MINUTE);
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const status = url.searchParams.get("status");
  if (status && !STATUSES.includes(status as ChatStatus)) {
    throw new ApiError(400, "invalid_request", `status debe ser uno de ${STATUSES.join(", ")}`);
  }
  const channel = url.searchParams.get("channel");
  if (channel && !(CHANNELS as readonly string[]).includes(channel)) {
    throw new ApiError(400, "invalid_request", `channel debe ser uno de ${CHANNELS.join(", ")}`);
  }
  const accountId = url.searchParams.get("accountId");
  const assignedToId = url.searchParams.get("assignedToId");
  const contactId = url.searchParams.get("contactId");

  const common = {
    lastMessageAt: { not: null },
    ...(status ? { status: status as ChatStatus } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(after
      ? { OR: [{ lastMessageAt: { lt: after.t } }, { lastMessageAt: after.t, id: { lt: after.id } }] }
      : {}),
  };
  const orderBy = [{ lastMessageAt: "desc" as const }, { id: "desc" as const }];

  const waAccountIds = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const chAccountIds = accountId ? ctx.channelAccountIds.filter((id) => id === accountId) : ctx.channelAccountIds;

  const wantWa = !channel || channel === "WHATSAPP";
  const wantChannels = !channel || channel !== "WHATSAPP";

  const [waChats, conversations] = await Promise.all([
    wantWa && waAccountIds.length > 0
      ? prisma.wAChat.findMany({
          where: { ...common, accountId: { in: waAccountIds } } as Prisma.WAChatWhereInput,
          orderBy,
          take: limit + 1,
        })
      : [],
    wantChannels && chAccountIds.length > 0
      ? prisma.conversation.findMany({
          where: {
            ...common,
            channelAccountId: { in: chAccountIds },
            ...(channel && channel !== "WHATSAPP" ? { channelAccount: { channel: channel as Exclude<typeof channel, "WHATSAPP"> } } : {}),
          } as Prisma.ConversationWhereInput,
          include: { channelAccount: { select: { channel: true } } },
          orderBy,
          take: limit + 1,
        })
      : [],
  ]);

  const merged = [
    ...waChats.map((c) => ({ at: c.lastMessageAt!, id: c.id, item: serializeConversation(c, c.accountId, "WHATSAPP") })),
    ...conversations.map((c) => ({
      at: c.lastMessageAt!,
      id: c.id,
      item: serializeConversation(c, c.channelAccountId, c.channelAccount.channel),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));

  const page = merged.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map((p) => p.item),
    nextCursor: merged.length > limit && last ? encodeCursor({ t: last.at.toISOString(), id: last.id }) : null,
  });
});
