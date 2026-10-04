import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { findScopedConversation, serializeMessage } from "@/lib/api/resources";

type Params = { params: Promise<{ id: string }> };

const MESSAGE_FIELDS = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  caption: true,
  mimeType: true,
  filename: true,
  status: true,
  senderId: true,
  timestamp: true,
} as const;

// GET — mensajes del más reciente al más antiguo, paginado por cursor. No
// incluye bytes de media (solo tipo/nombre); la media se ve en el CRM.
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
          select: { ...MESSAGE_FIELDS, interactivePayload: true },
          orderBy,
          take: limit + 1,
        })
      : await prisma.channelMessage.findMany({
          where: { conversationId: id, ...keyset },
          select: MESSAGE_FIELDS,
          orderBy,
          take: limit + 1,
        });

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map((m) => serializeMessage(m, id)),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.timestamp.toISOString(), id: last.id }) : null,
  });
});
