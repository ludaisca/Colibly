import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiContext } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readDateParam, readPageParams, withApiErrors, type ApiErrorCode, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { messagesFeed } from "@/lib/api/messages-feed";
import { findScopedContact, findScopedConversation } from "@/lib/api/resources";
import { apiSendMessageSchema, type ApiSendMessageInput } from "@/lib/api/schemas";
import { assertMediaSupported, OutboundError, previewOutbound, sendOutbound, type OutboundContent, type OutboundTarget } from "@/lib/messaging/outbound";
import { findApiMedia, readApiMedia } from "@/lib/media/api-media";
import { fetchOutboundMedia, fetchOutboundSticker, OutboundMediaError, OUTBOUND_MEDIA_TYPES, type OutboundMediaFile, type OutboundMediaType } from "@/lib/messaging/outbound-media";
import { findOrCreateApiWhatsAppContact } from "@/lib/api/contact-create";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
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

// POST /api/v1/messages — texto, botones, lista, archivo, plantilla aprobada y
// (solo WhatsApp) sticker, ubicación, pedir ubicación y botón con URL.
// Destino: conversationId, contactId (se usa su conversación) o accountId + to
// (WhatsApp: busca o crea el contacto por teléfono). WhatsApp exige la ventana
// de 24 h para todo menos plantillas: fuera de ella responde 422 window_closed.
// Una plantilla a un contacto que aún no tiene chat abre el chat. `replyTo`
// cita un mensaje de la misma conversación (WhatsApp).
export const POST = withIdempotency(withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const body = await readJsonBody(req, apiSendMessageSchema);
  const input = body;
  // Key de prueba: valida igual y responde lo que saldría, sin enviar ni guardar.
  if (ctx.test) return apiOk(await simulateSend(ctx, input));

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
  let openedChatId: string | null = null;
  try {
    const resolved = await resolveTarget(ctx, input);
    const target = resolved.target;
    openedChatId = resolved.openedChatId;

    const replyToWamid = input.replyTo ? await resolveReplyTo(target, input.replyTo) : null;

    // El archivo se descarga ya con el destino validado (un 404 no gasta una descarga).
    const file = await loadSendFile(ctx, input, target);

    try {
      const result = await sendOutbound(target, toContent(input, file), { source: "api", replyToWamid });
      sent = true;
      const conversationId = target.kind === "whatsapp" ? target.chat.id : target.conversation.id;
      return apiOk({ id: result.messageId, conversationId, externalId: result.externalId }, 201);
    } catch (err) {
      if (err instanceof OutboundError) {
        const [status, code] = OUTBOUND_STATUS[err.code];
        throw new ApiError(status, code, err.message, undefined, undefined, err.metaCode !== null ? { code: err.metaCode } : null);
      }
      throw err;
    }
  } finally {
    // Si el chat se abrió para este envío y no salió nada, no dejar un chat
    // vacío en el inbox.
    if (!sent && openedChatId) await prisma.wAChat.delete({ where: { id: openedChatId } }).catch(() => {});
    // Lo que no salió no gasta cupo diario.
    if (!sent) await refundDailyQuota(quotaKey);
  }
}));

// Archivo del envío: descargado de media.url o leído de POST /media (media.id).
async function loadSendFile(ctx: ApiContext, input: ApiSendMessageInput, target: OutboundTarget): Promise<OutboundMediaFile | null> {
  if (!input.media || !(isMedia(input.type) || input.type === "sticker")) return null;
  const field = input.media.id ? "media.id" : "media.url";
  try {
    if (input.type === "sticker" && target.kind !== "whatsapp") throw new OutboundError("invalid_request", 'El tipo "sticker" solo se puede enviar por WhatsApp');
    if (input.type !== "sticker") assertMediaSupported(target, input.caption);
    if (input.media.id) {
      const row = await findApiMedia(ctx.organizationId, input.media.id);
      if (!row) throw new ApiError(404, "not_found", "media.id: archivo no encontrado o caducado (POST /media)");
      if (row.mediaType !== input.type) throw new OutboundMediaError(`media.id es un archivo de tipo ${row.mediaType}; este envío es ${input.type}`);
      const file = await readApiMedia(row);
      return input.media.filename ? { ...file, filename: input.media.filename } : file;
    }
    return input.type === "sticker" ? await fetchOutboundSticker(input.media.url!) : await fetchOutboundMedia(input.type, { ...input.media, url: input.media.url! });
  } catch (err) {
    if (err instanceof OutboundError) throw new ApiError(400, "invalid_request", err.message);
    if (err instanceof OutboundMediaError) throw new ApiError(400, "invalid_request", err.message, undefined, [{ path: field, message: err.message }]);
    throw err;
  }
}

function isMedia(t: string): t is OutboundMediaType {
  return (OUTBOUND_MEDIA_TYPES as readonly string[]).includes(t);
}

function toContent(input: ApiSendMessageInput, file: OutboundMediaFile | null): OutboundContent {
  if (isMedia(input.type)) return { type: "media", mediaType: input.type, file: file!, caption: input.caption ?? null };
  switch (input.type) {
    case "contacts":
      return { type: "contacts", contacts: input.contacts! };
    case "text":
      return { type: "text", text: input.text! };
    case "buttons":
      return {
        type: "buttons",
        text: input.text!,
        buttons: input.buttons!.map((b, i) => ({ id: b.id ?? `btn_${i + 1}`, title: b.title })),
      };
    case "list":
      return {
        type: "list",
        text: input.text!,
        buttonLabel: input.list!.button,
        rows: input.list!.rows.map((r, i) => ({ id: r.id ?? `row_${i + 1}`, title: r.title, ...(r.description ? { description: r.description } : {}) })),
      };
    case "cta_url":
      return { type: "cta_url", text: input.text!, label: input.cta!.label, url: input.cta!.url };
    case "location":
      return { type: "location", ...input.location! };
    case "location_request":
      return { type: "location_request", text: input.text! };
    case "sticker":
      return { type: "sticker", file: file! };
    case "product":
      return { type: "product", productId: input.product!.id, catalogId: input.product!.catalogId ?? null, text: input.text ?? null, footer: input.footer ?? null };
    case "product_list":
      return {
        type: "product_list",
        header: input.productList!.header,
        text: input.text!,
        footer: input.footer ?? null,
        sections: input.productList!.sections,
        catalogId: input.productList!.catalogId ?? null,
      };
    case "catalog":
      return { type: "catalog", text: input.text!, footer: input.footer ?? null, thumbnailProductId: input.catalog?.thumbnailProductId ?? null };
    case "flow":
      return {
        type: "flow",
        flowId: input.flow!.id,
        cta: input.flow!.cta,
        text: input.text!,
        header: input.flow!.header ?? null,
        footer: input.footer ?? null,
        // El token vuelve en flow.completed: sirve para cruzar la respuesta.
        flowToken: input.flow!.token ?? `colibly_${randomUUID()}`,
        screen: input.flow!.screen ?? null,
        data: input.flow!.data ?? null,
        draft: input.flow!.draft ?? false,
      };
    default: {
      const { id, ...params } = input.template!;
      return { type: "template", templateId: id, ...params };
    }
  }
}

async function resolveTarget(
  ctx: ApiContext,
  input: ApiSendMessageInput
): Promise<{ target: OutboundTarget; openedChatId: string | null }> {
  if (input.conversationId) return { target: (await findScopedConversation(ctx, input.conversationId)).target, openedChatId: null };
  const isTemplate = input.type === "template";
  if (input.contactId) return targetForContact(ctx, input.contactId, isTemplate);

  // accountId + to: el contacto se crea solo si el envío puede salir (una
  // plantilla); sin ella el primer mensaje no saldría y quedaría un contacto
  // huérfano.
  const accountId = input.accountId!;
  if (!ctx.accountIds.includes(accountId)) {
    if (ctx.channelAccountIds.includes(accountId)) throw new ApiError(400, "invalid_request", "accountId + to solo sirve con cuentas de WhatsApp");
    throw new ApiError(404, "not_found", "Cuenta no encontrada");
  }
  const existing = await prisma.contact.findFirst({
    where: { accountId, remoteJid: { in: jidCandidates(input.to!) } },
    select: { id: true },
  });
  if (existing) return targetForContact(ctx, existing.id, isTemplate);
  if (!isTemplate) throw windowClosedForNewContact();
  const contact = await findOrCreateApiWhatsAppContact(ctx, { accountId, phone: input.to! });
  return targetForContact(ctx, contact.id, true);
}

// Simulación de una key sk_test_: mismo destino y reglas, sin crear contactos,
// chats ni mensajes, sin descargar archivos y sin gastar cupo.
async function simulateSend(ctx: ApiContext, input: ApiSendMessageInput) {
  const isTemplate = input.type === "template";
  let target: OutboundTarget | { kind: "new_whatsapp_chat"; accountId: string };
  if (input.conversationId) {
    target = (await findScopedConversation(ctx, input.conversationId)).target;
  } else {
    let contactId = input.contactId ?? null;
    let accountId: string | null = null;
    if (!contactId) {
      accountId = input.accountId!;
      if (!ctx.accountIds.includes(accountId)) {
        if (ctx.channelAccountIds.includes(accountId)) throw new ApiError(400, "invalid_request", "accountId + to solo sirve con cuentas de WhatsApp");
        throw new ApiError(404, "not_found", "Cuenta no encontrada");
      }
      const existing = await prisma.contact.findFirst({ where: { accountId, remoteJid: { in: jidCandidates(input.to!) } }, select: { id: true } });
      contactId = existing?.id ?? null;
    }
    if (contactId) {
      const contact = await findScopedContact(ctx, contactId);
      const conversationId = contact.chat?.id ?? contact.conversation?.id;
      accountId = contact.accountId;
      if (conversationId) target = (await findScopedConversation(ctx, conversationId)).target;
      else if (contact.accountId && isTemplate) target = { kind: "new_whatsapp_chat", accountId: contact.accountId };
      else throw windowClosedForNewContact();
    } else {
      if (!isTemplate) throw windowClosedForNewContact();
      target = { kind: "new_whatsapp_chat", accountId: accountId! };
    }
  }
  if (input.replyTo && target.kind !== "new_whatsapp_chat") await resolveReplyTo(target, input.replyTo);
  if (input.media?.id) {
    const row = await findApiMedia(ctx.organizationId, input.media.id);
    if (!row) throw new ApiError(404, "not_found", "media.id: archivo no encontrado o caducado (POST /media)");
  }
  if (target.kind === "channel" && isMedia(input.type)) {
    try {
      assertMediaSupported(target, input.caption);
    } catch (err) {
      if (err instanceof OutboundError) throw new ApiError(400, "invalid_request", err.message);
      throw err;
    }
  }
  const placeholder: OutboundMediaFile = { buffer: Buffer.alloc(0), mimeType: input.media?.mimeType ?? "application/octet-stream", filename: input.media?.filename ?? "archivo" };
  try {
    const preview = await previewOutbound(target, toContent(input, placeholder), { replyToWamid: input.replyTo ? "simulado" : null });
    const conversationId = target.kind === "whatsapp" ? target.chat.id : target.kind === "channel" ? target.conversation.id : null;
    return { id: null, conversationId, externalId: null, test: true, preview };
  } catch (err) {
    if (err instanceof OutboundError) {
      const [status, code] = OUTBOUND_STATUS[err.code];
      throw new ApiError(status, code, err.message);
    }
    throw err;
  }
}

function windowClosedForNewContact() {
  return new ApiError(
    422,
    "window_closed",
    "El contacto no tiene conversación todavía: el primer mensaje de WhatsApp debe ser una plantilla aprobada"
  );
}

async function targetForContact(
  ctx: ApiContext,
  contactId: string,
  isTemplate: boolean
): Promise<{ target: OutboundTarget; openedChatId: string | null }> {
  const contact = await findScopedContact(ctx, contactId);
  const conversationId = contact.chat?.id ?? contact.conversation?.id;
  if (conversationId) return { target: (await findScopedConversation(ctx, conversationId)).target, openedChatId: null };

  if (!contact.accountId || !isTemplate) throw windowClosedForNewContact();
  const chat = await prisma.wAChat.create({
    data: { accountId: contact.accountId, remoteJid: contact.remoteJid, name: contact.name, contactId: contact.id },
    include: { account: true },
  });
  return { target: { kind: "whatsapp", chat }, openedChatId: chat.id };
}

// replyTo = id de Colibly de un mensaje de la MISMA conversación que ya tenga
// id de WhatsApp (wamid). Otros canales: lo rechaza sendOutbound.
async function resolveReplyTo(target: OutboundTarget, messageId: string): Promise<string> {
  if (target.kind !== "whatsapp") {
    throw new ApiError(400, "invalid_request", "Citar un mensaje (replyTo) solo está disponible en WhatsApp");
  }
  const quoted = await prisma.wAMessage.findFirst({
    where: { id: messageId, chatId: target.chat.id },
    select: { wamid: true },
  });
  if (!quoted) throw new ApiError(404, "not_found", "replyTo: mensaje no encontrado en esta conversación");
  if (!quoted.wamid) throw new ApiError(400, "invalid_request", "replyTo: ese mensaje no tiene id de WhatsApp (no salió o es del historial sin id)");
  return quoted.wamid;
}

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
