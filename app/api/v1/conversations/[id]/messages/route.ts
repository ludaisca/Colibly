import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { findScopedConversation } from "@/lib/api/resources";
import { MESSAGE_SERIALIZE_SELECT_CHANNEL, MESSAGE_SERIALIZE_SELECT_WA, resolveReplyIds, serializeMessage } from "@/lib/messages/serialize";

type Params = { params: Promise<{ id: string }> };

// GET — mensajes del más reciente al más antiguo, paginado por cursor. Forma
// de cada mensaje: lib/messages/serialize.ts (la misma de los webhooks). Los
// bytes del medio se bajan aparte de `media.url` (GET /api/v1/messages/{id}/media).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  const found = await findScopedConversation(ctx, id);
  const { limit, cursor } = readPageParams(new URL(req.url));
  const after = decodeCursor(cursor);
  const keyset = after
    ? { OR: [{ timestamp: { lt: after.t } }, { timestamp: after.t, id: { lt: after.id } }] }
    : {};
  const orderBy = [{ timestamp: "desc" as const }, { id: "desc" as const }];

  const rows =
    found.kind === "whatsapp"
      ? await prisma.wAMessage.findMany({
          where: { chatId: id, ...keyset },
          select: MESSAGE_SERIALIZE_SELECT_WA,
          orderBy,
          take: limit + 1,
        })
      : await prisma.channelMessage.findMany({
          where: { conversationId: id, ...keyset },
          select: MESSAGE_SERIALIZE_SELECT_CHANNEL,
          orderBy,
          take: limit + 1,
        });

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const replyIds = await resolveReplyIds(found.kind, id, page);
  return apiOk({
    data: page.map((m) => {
      const reply = ("replyToWamid" in m ? m.replyToWamid : null) ?? ("replyToExternalId" in m ? m.replyToExternalId : null);
      return serializeMessage(m, id, { replyToMessageId: reply ? replyIds.get(reply) ?? null : null });
    }),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.timestamp.toISOString(), id: last.id }) : null,
  });
});
