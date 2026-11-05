import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiContext } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readDateParam, readPageParams, withApiErrors, type ApiErrorCode, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { messagesFeed } from "@/lib/api/messages-feed";
import { findScopedContact, findScopedConversation } from "@/lib/api/resources";
import { apiSendMessageSchema, type ApiSendMessageInput } from "@/lib/api/schemas";
import { assertMediaSupported, OutboundError, sendOutbound, type OutboundContent, type OutboundTarget } from "@/lib/messaging/outbound";
import { fetchOutboundMedia, OutboundMediaError, OUTBOUND_MEDIA_TYPES, type OutboundMediaFile, type OutboundMediaType } from "@/lib/messaging/outbound-media";
import { withIdempotency } from "@/lib/api/idempotency";
import { enforceLimit, rateLimiterUnavailable } from "@/lib/api/auth";
import { API_CONVERSATIONS_LIST_PER_MINUTE, API_DAILY_SENDS_PER_ORG, API_SEND_PER_MINUTE_PER_ORG } from "@/lib/api/constants";
import { mergeRateLimitInfo, setRateLimitInfo } from "@/lib/api/rate-headers";
import { consumeDailyQuota, RateLimitUnavailableError, refundDailyQuota } from "@/lib/rate-limit";

const OUTBOUND_STATUS: Record<OutboundError["code"], [number, ApiErrorCode]> = {
  window_closed: [422, "window_closed"],
  invalid_request: [400, "invalid_request"],
  not_found: [404, "not_found"],
  upstream_error: [502, "upstream_error"],
};

// GET /api/v1/messages?since=… — todo lo guardado desde esa fecha en las
// conversaciones de la key (entrantes y salientes, cualquier canal), del más
// viejo al más nuevo por createdAt. Para ponerse al día sin depender solo de
// los webhooks. `since` es obligatorio (acota la consulta); filtros: accountId,
// direction. Los cambios de estado de un mensaje ya listado no lo vuelven a
// traer: llegan por message.status_changed o con GET /messages/{id}.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  // Recorre todas las conversaciones de la key: mismo límite propio que GET /conversations.
  await enforceLimit(req, "endpoint", `api-msg-feed:${ctx.keyId}`, API_CONVERSATIONS_LIST_PER_MINUTE);
  const url = new URL(req.url);
  const since = readDateParam(url, "since");
  if (!since) throw new ApiError(400, "invalid_request", "since es requerido (fecha ISO 8601)");
  const { limit, cursor } = readPageParams(url);
  const direction = url.searchParams.get("direction");
  if (direction && direction !== "INBOUND" && direction !== "OUTBOUND") {
    throw new ApiError(400, "invalid_request", "direction debe ser INBOUND u OUTBOUND");
  }
  const { data, nextCursor } = await messagesFeed(ctx, {
    since,
    after: decodeCursor(cursor),
    limit,
    accountId: url.searchParams.get("accountId"),
    direction: (direction as "INBOUND" | "OUTBOUND" | null) ?? null,
  });
  return apiOk({ data, nextCursor: nextCursor ? encodeCursor({ t: nextCursor.t.toISOString(), id: nextCursor.id }) : null });
});

// POST /api/v1/messages — texto, botones (WhatsApp) o plantilla aprobada
// (WhatsApp). Destino: conversationId, o contactId (se usa su conversación).
// WhatsApp exige la ventana de 24 h para texto/botones: fuera de ella responde
// 422 window_closed y hay que mandar una plantilla. Una plantilla a un contacto
// de WhatsApp que aún no tiene chat (p. ej. recién creado por POST /contacts)
// abre el chat.
export const POST = withIdempotency(withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const body = await readJsonBody(req, apiSendMessageSchema);
  const input = body;

  // Límites propios del envío (además de los de key/organización): por minuto
  // por organización, y un cupo diario (día UTC) que protege la calidad del
  // número de WhatsApp ante un bucle. Se consumen después de validar el cuerpo.
  await enforceLimit(req, "endpoint", `api-send:${ctx.organizationId}`, API_SEND_PER_MINUTE_PER_ORG, 60,
    `Límite de ${API_SEND_PER_MINUTE_PER_ORG} envíos por minuto para la organización excedido`);
  const quotaKey = `api-sends:${ctx.organizationId}`;
  let quota;
  try {
    quota = await consumeDailyQuota(quotaKey, API_DAILY_SENDS_PER_ORG);
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) throw rateLimiterUnavailable();
    throw err;
  }
  if (!quota.allowed) {
    setRateLimitInfo(req, { limit: API_DAILY_SENDS_PER_ORG, remaining: 0, resetAt: quota.resetAt, scope: "daily" });
    throw new ApiError(429, "daily_limit_reached", `Cupo diario de ${API_DAILY_SENDS_PER_ORG} envíos por API alcanzado; se renueva a las 00:00 UTC`);
  }
  mergeRateLimitInfo(req, { limit: API_DAILY_SENDS_PER_ORG, remaining: quota.remaining, resetAt: quota.resetAt, scope: "daily" });
  let sent = false;
  try {
    const { target, openedChatId } = input.conversationId
      ? { target: (await findScopedConversation(ctx, input.conversationId)).target, openedChatId: null }
      : await targetForContact(ctx, input.contactId!, input.type === "template");

    // El archivo se descarga ya con el destino validado (un 404 no gasta una descarga).
    let file: OutboundMediaFile | null = null;
    if (input.media && isMedia(input.type)) {
      try {
        assertMediaSupported(target, input.caption);
        file = await fetchOutboundMedia(input.type, input.media);
      } catch (err) {
        if (openedChatId) await prisma.wAChat.delete({ where: { id: openedChatId } }).catch(() => {});
        if (err instanceof OutboundError) throw new ApiError(400, "invalid_request", err.message);
        if (err instanceof OutboundMediaError) {
          throw new ApiError(400, "invalid_request", err.message, undefined, [{ path: "media.url", message: err.message }]);
        }
        throw err;
      }
    }

    try {
      const result = await sendOutbound(target, toContent(input, file), { source: "api" });
      sent = true;
      const conversationId = target.kind === "whatsapp" ? target.chat.id : target.conversation.id;
      return apiOk({ id: result.messageId, conversationId, externalId: result.externalId }, 201);
    } catch (err) {
      // Si el chat se abrió para este envío y Meta lo rechazó, no dejar un chat
      // vacío en el inbox.
      if (openedChatId) await prisma.wAChat.delete({ where: { id: openedChatId } }).catch(() => {});
      if (err instanceof OutboundError) {
        const [status, code] = OUTBOUND_STATUS[err.code];
        throw new ApiError(status, code, err.message);
      }
      throw err;
    }
  } finally {
    // Lo que no salió no gasta cupo diario.
    if (!sent) await refundDailyQuota(quotaKey);
  }
}));

function isMedia(t: string): t is OutboundMediaType {
  return (OUTBOUND_MEDIA_TYPES as readonly string[]).includes(t);
}

function toContent(input: ApiSendMessageInput, file: OutboundMediaFile | null): OutboundContent {
  if (isMedia(input.type)) return { type: "media", mediaType: input.type, file: file!, caption: input.caption ?? null };
  if (input.type === "text") return { type: "text", text: input.text! };
  if (input.type === "buttons") {
    return {
      type: "buttons",
      text: input.text!,
      buttons: input.buttons!.map((b, i) => ({ id: b.id ?? `btn_${i + 1}`, title: b.title })),
    };
  }
  return {
    type: "template",
    templateId: input.template!.id,
    bodyParams: input.template!.bodyParams,
    headerParam: input.template!.headerParam,
    buttonParam: input.template!.buttonParam,
  };
}

async function targetForContact(
  ctx: ApiContext,
  contactId: string,
  isTemplate: boolean
): Promise<{ target: OutboundTarget; openedChatId: string | null }> {
  const contact = await findScopedContact(ctx, contactId);
  const conversationId = contact.chat?.id ?? contact.conversation?.id;
  if (conversationId) return { target: (await findScopedConversation(ctx, conversationId)).target, openedChatId: null };

  if (!contact.accountId || !isTemplate) {
    throw new ApiError(
      422,
      "window_closed",
      "El contacto no tiene conversación todavía: el primer mensaje de WhatsApp debe ser una plantilla aprobada"
    );
  }
  const chat = await prisma.wAChat.create({
    data: { accountId: contact.accountId, remoteJid: contact.remoteJid, name: contact.name, contactId: contact.id },
    include: { account: true },
  });
  return { target: { kind: "whatsapp", chat }, openedChatId: chat.id };
}

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
