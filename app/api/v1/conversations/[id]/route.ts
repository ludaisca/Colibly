import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { findScopedConversation, serializeConversation, type ScopedConversation } from "@/lib/api/resources";
import { apiConversationUpdateSchema } from "@/lib/api/schemas";
import { assignChat, ChatActionError, setChatStatus, setChatTeam } from "@/lib/chats/actions";

type Params = { params: Promise<{ id: string }> };

function serializeFound(found: ScopedConversation) {
  if (found.kind === "whatsapp") {
    const { chat } = found.target;
    return serializeConversation(chat, chat.accountId, "WHATSAPP");
  }
  const { conversation } = found.target;
  return serializeConversation(conversation, conversation.channelAccountId, conversation.channelAccount.channel);
}

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  return apiOk(serializeFound(await findScopedConversation(ctx, id)));
});

// PATCH /api/v1/conversations/{id} — cambia el estado (OPEN, PENDING,
// RESOLVED), la asignación (assignedToId: id de GET /users, o null para
// quitarla) y/o el equipo (teamId: id de GET /teams, o null). Mismos efectos que en la bandeja: resolver exige los atributos
// obligatorios (422 required_fields), limpia "esperando respuesta", puede
// mandar la encuesta CSAT y emite conversation.resolved / conversation.assigned.
// La persona asignada debe poder atender la cuenta (si no, 400).
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:write");
  const { id } = await params;
  const body = await readJsonBody(req, apiConversationUpdateSchema);
  const found = await findScopedConversation(ctx, id);
  const kind = found.kind;

  try {
    // Primero el equipo (puede autoasignar dentro de él), después la asignación
    // explícita, que gana; si algo no es válido, el estado no se toca.
    if (body.teamId !== undefined) await setChatTeam(kind, id, body.teamId, { organizationId: ctx.organizationId, actorId: ctx.userId });
    if (body.assignedToId !== undefined) await assignChat(kind, id, body.assignedToId, ctx.userId);
    if (body.status !== undefined) await setChatStatus(kind, id, body.status);
  } catch (err) {
    if (err instanceof ChatActionError) {
      if (err.code === "invalid_team") {
        throw new ApiError(400, "invalid_request", "teamId: el equipo no existe en tu organización", undefined, [
          { path: "teamId", message: "Usa un id de GET /teams" },
        ]);
      }
      if (err.code === "invalid_assignee") {
        throw new ApiError(400, "invalid_request", "assignedToId: la persona no existe, está desactivada o no puede atender esta cuenta", undefined, [
          { path: "assignedToId", message: "No puede atender esta cuenta" },
        ]);
      }
      const fields = Array.isArray(err.fields) ? (err.fields as Array<{ key: string; label: string }>) : [];
      throw new ApiError(422, "required_fields", err.message, undefined, fields.map((f) => ({ path: `attributes.${f.key}`, message: `${f.label} es obligatorio para resolver` })));
    }
    throw err;
  }

  // Se relee para devolver el estado final (updatedAt, resolvedAt…).
  const fresh =
    kind === "whatsapp"
      ? await prisma.wAChat.findUniqueOrThrow({ where: { id } }).then((chat) => serializeConversation(chat, chat.accountId, "WHATSAPP"))
      : await prisma.conversation
          .findUniqueOrThrow({ where: { id }, include: { channelAccount: { select: { channel: true } } } })
          .then((c) => serializeConversation(c, c.channelAccountId, c.channelAccount.channel));
  return apiOk(fresh);
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
