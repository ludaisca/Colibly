import { prisma } from "@/lib/prisma";
import { authenticateApiKey, enforceLimit } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { apiReactionSchema } from "@/lib/api/schemas";
import { withIdempotency } from "@/lib/api/idempotency";
import { API_SEND_PER_MINUTE_PER_ORG } from "@/lib/api/constants";
import { reactToWhatsAppMessage, ReactionError } from "@/lib/whatsapp/send-reaction";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { BillingBlockedError } from "@/lib/billing/gates";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/messages/{id}/reaction — reacciona con un emoji a un mensaje
// (entrante o saliente) de WhatsApp; `emoji: ""` quita la reacción. Solo
// mensajes de los últimos 30 días con id de WhatsApp (regla de Meta). Cuenta
// para el límite por minuto de envíos (no para el cupo diario). El emoji
// visible lo confirma después el estado de Meta (message.status_changed no
// aplica: la reacción no es un mensaje propio en Colibly).
export const POST = withIdempotency(withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { emoji } = await readJsonBody(req, apiReactionSchema);
  const { id } = await params;

  const message = ctx.accountIds.length
    ? await prisma.wAMessage.findFirst({ where: { id, chat: { accountId: { in: ctx.accountIds } } }, include: { chat: { include: { account: true } } } })
    : null;
  if (!message) {
    const other = ctx.channelAccountIds.length
      ? await prisma.channelMessage.findFirst({ where: { id, conversation: { channelAccountId: { in: ctx.channelAccountIds } } }, select: { id: true } })
      : null;
    if (other) throw new ApiError(400, "invalid_request", "Las reacciones por API solo están disponibles en WhatsApp");
    throw new ApiError(404, "not_found", "Mensaje no encontrado");
  }

  await enforceLimit(req, "endpoint", `api-send:${ctx.organizationId}`, API_SEND_PER_MINUTE_PER_ORG, 60,
    `Límite de ${API_SEND_PER_MINUTE_PER_ORG} envíos por minuto para la organización excedido`);
  try {
    const reaction = await reactToWhatsAppMessage(message, emoji, ctx.userId);
    return apiOk({ messageId: message.id, emoji: reaction.emoji, status: reaction.status }, 201);
  } catch (err) {
    if (err instanceof ReactionError) throw new ApiError(err.code === "busy" ? 409 : 400, err.code === "busy" ? "conflict" : "invalid_request", err.message);
    if (err instanceof BillingBlockedError) throw new ApiError(402, "read_only", err.message);
    if (err instanceof MetaSendError) throw new ApiError(502, "upstream_error", err.message, undefined, undefined, err.metaCode !== null ? { code: err.metaCode } : null);
    throw err;
  }
}));

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
