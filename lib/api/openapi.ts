import { API_SCOPES } from "./scopes";
import { OUTBOUND_MEDIA_RULES, OUTBOUND_MEDIA_TYPES } from "@/lib/messaging/outbound-media";
import { WEBHOOK_ROTATION_MAX_GRACE_HOURS } from "@/lib/webhooks/crud";
import { OUTBOUND_ORIGINS } from "@/lib/messages/origin";
import { DOMAIN_EVENT_CATALOG, type DomainEventType } from "@/lib/events/types";
import { BRAND_NAME } from "@/lib/brand";
import {
  API_BAD_KEY_ATTEMPTS_PER_MINUTE,
  API_CONVERSATIONS_LIST_PER_MINUTE,
  API_DAILY_SENDS_PER_ORG,
  API_IP_REQUESTS_PER_MINUTE,
  API_MAX_BODY_BYTES,
  API_ORG_REQUESTS_PER_MINUTE,
  API_SEND_PER_MINUTE_PER_ORG,
  API_UNAVAILABLE_RETRY_SECONDS,
  API_PAGE_DEFAULT,
  API_PAGE_MAX,
  API_REQUESTS_PER_MINUTE,
  API_SCHEMA_VERSION,
  API_SCHEMA_VERSION_HEADER,
  API_WEBHOOK_REPLAYS_PER_MINUTE,
  API_WEBHOOK_TESTS_PER_MINUTE,
  IDEMPOTENCY_TTL_HOURS,
  MAX_ACTIVE_API_KEYS,
  MAX_WEBHOOKS,
  WEBHOOK_BACKOFF_BASE_MS,
  WEBHOOK_DELIVERY_ATTEMPTS,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_PER_ENDPOINT_CONCURRENCY,
  WEBHOOK_TIMEOUT_SECONDS,
} from "./constants";

// Especificación OpenAPI 3.1 de /api/v1, escrita a mano (la API es chica y
// estable; generarla desde zod agregaría una dependencia por poco). Si cambias
// un endpoint en app/api/v1, actualiza este archivo en el mismo cambio: la
// página pública /docs/api se arma desde aquí (incluidos los ejemplos), así
// que lo que no esté aquí no existe para quien integra.
//
// Extensiones propias (las lee /docs/api):
//   x-colibly-events     catálogo de eventos de webhook con su `data` y ejemplo
//   x-colibly-error-codes  códigos de error estables con su status HTTP

export const API_VERSION = "1.4.0";

// Cambios del contrato, del más nuevo al más viejo. Todos aditivos dentro de v1.
export const API_CHANGELOG: { version: string; schemaVersion: string; date: string; changes: string[] }[] = [
  {
    version: "1.4.0",
    schemaVersion: API_SCHEMA_VERSION,
    date: "2026-11-06",
    changes: [
      "Plantillas: POST /templates/sync pregunta a Meta por el estado de las plantillas de las cuentas de la key y devuelve la lista actualizada (útil tras crear una plantilla: pasa de PENDING a APPROVED o REJECTED). Template.statusReason trae el motivo de un rechazo, pausa o aviso de calidad. GET /templates ya no se queda con un estado viejo: refresca en segundo plano las plantillas en revisión.",
    ],
  },
  {
    version: "1.3.0",
    schemaVersion: API_SCHEMA_VERSION,
    date: "2026-11-05",
    changes: [
      "Equipos: GET /teams (id, name, memberIds), Conversation.teamId, filtro teamId en GET /conversations y teamId en PATCH /conversations/{id} (null la saca del equipo). Mover a un equipo una conversación sin asignar la asigna dentro del equipo si la cuenta tiene la asignación automática.",
    ],
  },
  {
    version: "1.2.0",
    schemaVersion: "2026-11-05",
    date: "2026-11-05",
    changes: [
      "Catálogos para armar llamadas: GET /templates (con los parámetros que pide cada plantilla), GET /tags, GET /users y GET /automations (runnable = acepta POST /automations/{id}/runs).",
      "PATCH /conversations/{id}: cambiar status (OPEN, PENDING, RESOLVED) y assignedToId, con los mismos efectos que en la bandeja. Permiso nuevo conversations:write.",
      "POST /messages envía archivos: type image, document, audio o video con media.url (https pública; Colibly la descarga), media.filename, media.mimeType y caption. Funciona en WhatsApp (dentro de la ventana de 24 h), Telegram, Messenger e Instagram.",
      "Webhooks: POST /webhooks/{id}/test (evento webhook.test firmado) y POST /webhooks/{id}/rotate-secret, con graceHours opcional: el secreto anterior sigue firmando ese tiempo como segunda v1 de X-Colibly-Signature (t=…,v1=<nuevo>,v1=<anterior>). Webhook.previousSecretExpiresAt.",
      "Errores: error.details[] con la ruta de cada campo inválido y error.requestId; mensajes de validación en español; cuerpo vacío o JSON mal formado con su propio mensaje. Códigos nuevos: method_not_allowed (405, con header Allow) y required_fields (422).",
      "Header X-Request-Id en cada respuesta: inclúyelo al escribir a soporte.",
    ],
  },
  {
    version: "1.1.0",
    schemaVersion: "2026-11-04",
    date: "2026-11-04",
    changes: [
      "Message: origin, sentBy y senderName (quién y qué parte de Colibly mandó cada saliente); error con title, details y href de Meta; externalId, content, media (descarga con GET /messages/{id}/media), replyTo, reaction, transcript, deliveredAt, readAt y pricing.",
      "message.sent se emite desde todos los orígenes: bandeja, API, automatizaciones, bot IA, campañas, secuencias, recuperación de leads, avisos automáticos y la app WhatsApp Business (Coexistencia). data agrega origin, sentBy y senderName; text ya no trae marcadores como \"[sticker]\".",
      "message.status_changed (nuevo): estado de un saliente de WhatsApp con previousStatus, error completo y pricing.",
      "Sobre de los eventos: account.phoneNumber y account.phoneE164; contact.realName y contact.phoneE164; message en los eventos message.*.",
      "Contact.phoneE164 y Account.phoneE164 (E.164, México sin el \"1\" móvil antiguo).",
      "Message.referral (anuncio click-to-WhatsApp) y Message.createdAt; Contact.adId y Contact.ctwaClid; Conversation.updatedAt; contact.tags en el sobre de los eventos.",
      "Un media_placeholder del historial de Coexistencia trae content.placeholder = { reason: \"history_media\" }: el medio llega aparte y el mismo mensaje cambia a su tipo real (reléelo con GET /messages/{id}).",
      "Media.sha256Hex: sha256 (hex) de los bytes que entrega media.url, calculado por Colibly en todos los canales y direcciones (sha256 sigue siendo el de Meta, en base64).",
      "Contact.dealValueCents, dealCurrency y expectedCloseAt (lectura y PATCH /contacts/{id}).",
      "message.updated (nuevo): el medio de un mensaje quedó listo para descargar, o un media_placeholder del historial recibió su contenido.",
      "Webhooks: GET /webhooks/{id}/deliveries (historial, filtro status/eventType/since), GET /webhooks/{id}/deliveries/{deliveryId} (con el cuerpo enviado) y POST …/replay (reenvía el mismo evento).",
      "Sincronización incremental: updatedSince en GET /conversations, since en GET /conversations/{id}/messages y el nuevo GET /messages?since= (todas las conversaciones). Nuevo GET /messages/{id}.",
      "Header X-Colibly-Schema-Version en cada respuesta y cada entrega de webhook.",
      "Errores: una ruta inexistente bajo /api/v1 responde JSON 404; un limit que no es entero positivo responde 400.",
      "deliveredAt y readAt confiables desde 2026-11-04 19:47 UTC (antes solo en mensajes de campaña); un read sin delivered previo trae deliveredAt = readAt.",
    ],
  },
  { version: "1.0.0", schemaVersion: "2026-10-01", date: "2026-10-01", changes: ["Primera versión pública."] },
];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const paged = (item: string) => ({
  type: "object",
  required: ["data", "nextCursor"],
  properties: {
    data: { type: "array", items: ref(item) },
    nextCursor: { type: ["string", "null"], description: "null en la última página" },
  },
});
const json = (schema: object, example?: unknown) => ({ "application/json": { schema, ...(example !== undefined ? { example } : {}) } });
const rateHeaders = {
  "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "X-RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
  "X-RateLimit-Scope": { $ref: "#/components/headers/RateLimitScope" },
};
const requestIdHeader = { "X-Request-Id": { $ref: "#/components/headers/RequestId" } };
const ok = (schema: object, example?: unknown, description = "OK") => ({ description, headers: { ...rateHeaders, ...requestIdHeader }, content: json(schema, example) });
const list = (item: string) => ({ type: "object", required: ["data"], properties: { data: { type: "array", items: ref(item) } } });
const err = (name: string) => ({ $ref: `#/components/responses/${name}` });
const errors = {
  "400": err("InvalidRequest"),
  "401": err("Unauthorized"),
  "402": err("PaymentRequired"),
  "403": err("Forbidden"),
  "404": err("NotFound"),
  "429": err("RateLimited"),
  "500": err("InternalError"),
  "503": err("ServiceUnavailable"),
};
const writeErrors = { ...errors, "409": err("Conflict"), "413": err("PayloadTooLarge"), "422": err("Unprocessable") };
const pageParams = [
  { name: "limit", in: "query", description: `Entero de 1 a ${API_PAGE_MAX}; uno mayor se recorta a ${API_PAGE_MAX}, uno no numérico o menor que 1 responde 400`, schema: { type: "integer", minimum: 1, maximum: API_PAGE_MAX, default: API_PAGE_DEFAULT } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` de la página anterior" },
];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const ORIGIN_DOC =
  "Qué parte de Colibly lo mandó: agent (bandeja), api, automation (automatizaciones, macros, fuentes de leads), bot (bot IA), campaign, sequence, recovery (recuperación de leads), system (aviso fuera de horario, auto-resolver, encuesta CSAT), business_app (escrito en la app WhatsApp Business del teléfono, Coexistencia), history (importado del historial de esa app)";
const SENT_BY_DOC = "Quién: contact (el cliente), user (una persona de Colibly, senderId), bot, business_app (el negocio desde su teléfono) o system (Colibly sin una persona detrás)";
const idempotencyParam = { $ref: "#/components/parameters/IdempotencyKey" };
const deliveryIdParam = { name: "deliveryId", in: "path", required: true, schema: { type: "string" } };
const scopeNote = (scope: string) => `Requiere el permiso \`${scope}\`.`;

// ─── Ejemplos (los usa la referencia de /docs/api) ──────────────────────────
const EX = {
  account: { id: "cmacc_wa_01", channel: "WHATSAPP", name: "Ventas CDMX", phoneNumber: "+52 1 55 1234 5678", phoneE164: "+525512345678", status: "CONNECTED" },
  contact: {
    id: "cmcon_01",
    accountId: "cmacc_wa_01",
    channel: "WHATSAPP",
    name: "Ana López",
    realName: null,
    phone: "5215598765432",
    phoneE164: "+525598765432",
    externalId: null,
    leadStatus: "QUALIFIED",
    leadOrigin: "ORGANIC",
    adId: null,
    ctwaClid: null,
    dealValueCents: 85000,
    dealCurrency: "MXN",
    expectedCloseAt: "2026-10-25T00:00:00.000Z",
    optedOutMarketing: false,
    tags: [{ id: "cmtag_01", name: "Mayoreo" }],
    customFields: { ciudad: "Puebla" },
    conversationId: "cmchat_01",
    createdAt: "2026-10-01T16:20:00.000Z",
    updatedAt: "2026-10-18T19:02:11.000Z",
  },
  conversation: {
    id: "cmchat_01",
    accountId: "cmacc_wa_01",
    channel: "WHATSAPP",
    contactId: "cmcon_01",
    name: "Ana López",
    status: "OPEN",
    assignedToId: "cmusr_02",
    teamId: "cmteam_01",
    unreadCount: 1,
    lastMessage: "¿Tienen envío a Puebla?",
    lastMessageAt: "2026-10-18T19:02:11.000Z",
    createdAt: "2026-10-01T16:20:00.000Z",
    updatedAt: "2026-10-18T19:02:11.000Z",
  },
  message: {
    id: "cmmsg_01",
    conversationId: "cmchat_01",
    direction: "INBOUND",
    type: "text",
    text: "¿Tienen envío a Puebla?",
    caption: null,
    mimeType: null,
    filename: null,
    status: null,
    senderId: null,
    interactive: null,
    timestamp: "2026-10-18T19:02:11.000Z",
    externalId: "wamid.HBgNNTIxNTU1MTExMTIyMjIVAgASGBQzQTk5",
    content: null,
    media: null,
    replyTo: null,
    reaction: null,
    transcript: null,
    error: null,
    deliveredAt: null,
    readAt: null,
    pricing: null,
    origin: "contact",
    sentBy: "contact",
    senderName: null,
    referral: null,
    createdAt: "2026-10-18T19:02:12.000Z",
  },
  delivery: {
    id: "cmwhd_01",
    eventId: "7d1f2c9e-3b4a-4f0e-9a51-0c2b8e6d4f10",
    eventType: "message.status_changed",
    status: "failed",
    attempts: 6,
    responseCode: 500,
    error: "HTTP 500",
    createdAt: "2026-10-18T19:02:11.000Z",
    deliveredAt: null,
  },
  webhook: {
    id: "cmwh_01",
    name: "ERP pedidos",
    url: "https://erp.ejemplo.mx/colibly/eventos",
    events: ["contact.created", "contact.lead_status_changed"],
    accountIds: [],
    channelAccountIds: [],
    active: true,
    status: "active",
    ownerId: "cmusr_01",
    pausedAt: null,
    pausedReason: null,
    disabledAt: null,
    consecutiveFailures: 0,
    lastDeliveryAt: "2026-10-18T19:02:13.000Z",
    previousSecretExpiresAt: null,
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  template: {
    id: "cmtpl_01",
    accountId: "cmacc_wa_01",
    name: "confirmacion_pedido",
    language: "es_MX",
    category: "UTILITY",
    status: "APPROVED",
    statusReason: null,
    params: { bodyParamCount: 2, header: null, buttonParamRequired: false },
    bodyText: "Hola {{1}}, tu pedido {{2}} va en camino.",
    syncedAt: "2026-10-18T12:00:00.000Z",
  },
  tag: { id: "cmtag_01", accountId: "cmacc_wa_01", name: "Mayoreo", color: "accent", createdAt: "2026-10-01T16:20:00.000Z" },
  user: { id: "cmusr_02", name: "Carlos Ventas", email: "carlos@ejemplo.mx", role: "user", active: true },
  team: { id: "cmteam_01", name: "Ventas", memberIds: ["cmusr_02"], createdAt: "2026-11-05T15:00:00.000Z" },
  automation: {
    id: "cmaut_01",
    accountId: "cmacc_wa_01",
    name: "Pedido confirmado",
    description: "Avisa al cliente y lo etiqueta",
    status: "ACTIVE",
    triggerType: "manual",
    runnable: true,
    updatedAt: "2026-10-15T18:00:00.000Z",
  },
};
const cursorExample = "eyJ0IjoiMjAyNi0xMC0xOFQxOTowMjoxMS4wMDBaIiwiaWQiOiJjbWNvbl8wMSJ9";

// ─── Catálogo de eventos de webhook ─────────────────────────────────────────
type EventDoc = { type: DomainEventType | "webhook.test"; description: string; data: object; example: Record<string, unknown> };
const str = { type: "string" };
const strNull = { type: ["string", "null"] };
const obj = (properties: Record<string, object>) => ({ type: "object", properties });

const EVENT_DATA: Record<DomainEventType, { data: object; example: Record<string, unknown> }> = {
  "message.received": {
    data: obj({ messageId: str, messageType: str, text: strNull, interactiveReplyId: { ...strNull, description: "id del botón o fila elegida" } }),
    example: { messageId: "cmmsg_01", messageType: "text", text: "¿Tienen envío a Puebla?", interactiveReplyId: null },
  },
  "message.sent": {
    data: obj({
      messageId: str,
      messageType: str,
      text: strNull,
      source: { type: "string", enum: ["agent", "api", "automation"], description: "Campo original de 3 valores; usa origin para el detalle" },
      senderId: { ...strNull, description: "Usuario de Colibly que lo mandó o lo disparó (bandeja, macro, permiso de llamada)" },
      origin: { type: "string", enum: [...OUTBOUND_ORIGINS], description: ORIGIN_DOC },
      sentBy: { type: "string", enum: ["user", "bot", "business_app", "system"], description: SENT_BY_DOC },
      senderName: { ...strNull, description: "Nombre del usuario de senderId" },
    }),
    example: { messageId: "cmmsg_02", messageType: "text", text: "Sí, enviamos a todo México.", source: "agent", senderId: "cmusr_02", origin: "agent", sentBy: "user", senderName: "Carla Méndez" },
  },
  "message.status_changed": {
    data: obj({
      messageId: str,
      status: { type: "string", enum: ["sent", "delivered", "read", "failed"] },
      previousStatus: { ...strNull, description: "Estado anterior (null si no tenía). Los estados solo avanzan: sent → delivered → read; failed aplica siempre" },
      error: {
        type: ["object", "null"],
        description: "Solo en failed. message = motivo en español; title, details y href = los de Meta sin traducir",
        properties: { code: { type: ["integer", "null"] }, message: str, title: strNull, details: strNull, href: strNull },
      },
      pricing: {
        type: ["object", "null"],
        description: "Modelo por mensaje de Meta: si se cobra y en qué categoría",
        properties: { billable: { type: ["boolean", "null"] }, model: strNull, category: { ...strNull, description: "marketing, utility, authentication, service" }, type: { ...strNull, description: "p. ej. regular, free_customer_service, free_entry_point" } },
      },
    }),
    example: { messageId: "cmmsg_02", status: "delivered", previousStatus: "sent", error: null, pricing: { billable: false, model: "PMP", category: "service", type: "free_customer_service" } },
  },
  "message.updated": {
    data: obj({
      messageId: str,
      reason: { type: "string", enum: ["media_ready", "history_media"], description: "media_ready = el archivo ya se puede bajar de media.url; history_media = un media_placeholder del historial recibió su tipo y contenido reales" },
    }),
    example: { messageId: "cmmsg_01", reason: "media_ready" },
  },
  "contact.created": {
    data: obj({
      origin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
      source: {
        type: "string",
        enum: ["inbound", "api", "lead_ads", "history", "echo", "import"],
        description: "inbound = escribió el contacto; api = POST /contacts; lead_ads = formulario de Meta; history = importación del historial de WhatsApp Business; echo = el negocio escribió primero desde la app WhatsApp Business; import = importación CSV desde Contactos",
      },
    }),
    example: { origin: "ORGANIC", source: "inbound" },
  },
  "contact.lead_status_changed": {
    data: obj({ from: ref("LeadStatus"), to: ref("LeadStatus") }),
    example: { from: "NEW", to: "QUALIFIED" },
  },
  "tag.added": {
    data: obj({ tagId: str, tagName: str, target: { type: "string", enum: ["contact", "conversation"] } }),
    example: { tagId: "cmtag_01", tagName: "Mayoreo", target: "contact" },
  },
  "conversation.assigned": {
    data: obj({ assignedToId: strNull, auto: { type: "boolean", description: "true si la asignó la regla automática" } }),
    example: { assignedToId: "cmusr_02", auto: true },
  },
  "conversation.resolved": { data: obj({}), example: {} },
  "appointment.created": {
    data: obj({ appointmentId: str, title: str, scheduledAt: { type: "string", format: "date-time" }, source: { type: "string", enum: ["MANUAL", "AI_BOT", "API"] } }),
    example: { appointmentId: "cmapt_01", title: "Visita a showroom", scheduledAt: "2026-10-22T17:00:00.000Z", source: "AI_BOT" },
  },
  "appointment.status_changed": {
    data: obj({ appointmentId: str, from: str, to: str }),
    example: { appointmentId: "cmapt_01", from: "SCHEDULED", to: "COMPLETED" },
  },
  "lead.scored": {
    data: obj({ scorerId: str, scorerName: str, score: { type: "number" }, label: str, previousLabel: strNull }),
    example: { scorerId: "cmsc_01", scorerName: "Intención de compra", score: 82, label: "Caliente", previousLabel: "Tibio" },
  },
  "lead.ad_captured": {
    data: obj({ origin: { type: "string", enum: ["INSTANT_FORM", "CTWA"] }, adId: strNull }),
    example: { origin: "CTWA", adId: "120210000000000000" },
  },
};

export const WEBHOOK_EVENT_DOCS: EventDoc[] = [
  ...(Object.entries(DOMAIN_EVENT_CATALOG) as [DomainEventType, string][]).map(([type, description]) => ({
    type,
    description,
    ...EVENT_DATA[type],
  })),
  {
    type: "webhook.test",
    description: "Evento de prueba (botón “Probar” en Configuración → API). account, contact y conversation llegan en null.",
    data: obj({ message: str }),
    example: { message: `Evento de prueba enviado desde ${BRAND_NAME}` },
  },
];

export function exampleEvent(type: string, data: Record<string, unknown>) {
  const test = type === "webhook.test";
  return {
    id: "7d1f2c9e-3b4a-4f0e-9a51-0c2b8e6d4f10",
    type,
    occurredAt: "2026-10-18T19:02:11.000Z",
    account: test ? null : { id: EX.account.id, channel: "WHATSAPP", name: EX.account.name, phoneNumber: EX.account.phoneNumber, phoneE164: EX.account.phoneE164 },
    contact: test
      ? null
      : { id: EX.contact.id, name: EX.contact.name, realName: null, tags: EX.contact.tags, phone: EX.contact.phone, phoneE164: EX.contact.phoneE164, externalId: null, leadStatus: EX.contact.leadStatus, leadOrigin: "ORGANIC" },
    conversation: test || type === "contact.created" ? null : { id: EX.conversation.id, channel: "WHATSAPP", status: "OPEN", assignedToId: "cmusr_02" },
    data,
    ...(type.startsWith("message.") ? { message: EX.message } : {}),
  };
}

// ─── Errores ────────────────────────────────────────────────────────────────
export const API_ERROR_CODES: { code: string; status: number; description: string }[] = [
  { code: "invalid_request", status: 400, description: "Cuerpo o parámetros inválidos; `message` dice cuál y `details` trae cada campo (`path`, `message`)." },
  { code: "unauthorized", status: 401, description: "Falta la API key, es inválida, está revocada o vencida, o su dueño ya no es admin." },
  { code: "plan_limit", status: 402, description: "El dueño de la API key ya no es administrador con licencia Pro, o se alcanzó un límite de la organización (p. ej. contactos)." },
  { code: "read_only", status: 402, description: "Cuenta en solo lectura (prueba vencida o pago pendiente): solo GET." },
  { code: "forbidden", status: 403, description: "La key no tiene el permiso que pide el endpoint." },
  { code: "not_found", status: 404, description: "No existe o no está al alcance de la key." },
  { code: "method_not_allowed", status: 405, description: "La ruta existe pero no acepta ese método; el header `Allow` dice cuáles sí." },
  { code: "conflict", status: 409, description: "Choca con el estado actual (p. ej. automatización ya en curso, o la misma Idempotency-Key sigue en proceso)." },
  { code: "limit_reached", status: 409, description: `Tope por cuenta: ${MAX_WEBHOOKS} webhooks.` },
  { code: "window_closed", status: 422, description: "WhatsApp: fuera de la ventana de 24 h solo se puede enviar una plantilla aprobada." },
  { code: "idempotency_conflict", status: 422, description: "La Idempotency-Key ya se usó con otro cuerpo o en otro endpoint." },
  { code: "required_fields", status: 422, description: "No se puede resolver la conversación: faltan atributos obligatorios (ver `details`)." },
  { code: "payload_too_large", status: 413, description: `El cuerpo supera ${Math.round(API_MAX_BODY_BYTES / 1024)} KB.` },
  { code: "rate_limited", status: 429, description: "Demasiadas solicitudes (por key, organización, IP o endpoint; ver `X-RateLimit-Scope`); espera los segundos de `Retry-After`." },
  { code: "daily_limit_reached", status: 429, description: `Cupo diario de ${API_DAILY_SENDS_PER_ORG} envíos por API por organización (día UTC); \`Retry-After\` indica cuándo se renueva.` },
  { code: "internal_error", status: 500, description: "Error nuestro. Reintenta con la misma Idempotency-Key." },
  { code: "upstream_error", status: 502, description: "WhatsApp/Meta u otro canal rechazó o no respondió." },
  { code: "service_unavailable", status: 503, description: "Servicio temporalmente no disponible (p. ej. el limitador de velocidad); reintenta tras `Retry-After`." },
];

const errorResponse = (description: string, code: string, message: string, headers?: object, details?: { path: string; message: string }[]) => ({
  description,
  headers: { ...requestIdHeader, ...(headers ?? {}) },
  content: json(ref("Error"), { error: { code, message, ...(details ? { details } : {}), requestId: "req_4fQm1x9TzK2bLw7a" } }),
});

export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: `${BRAND_NAME} API`,
      version: API_VERSION,
      description:
        `API pública de ${BRAND_NAME} (plan Pro). ` +
        "Autenticación: `Authorization: Bearer sk_live_...` (API key creada por un admin en Configuración → API). " +
        `Límites: ${API_REQUESTS_PER_MINUTE} solicitudes por minuto por key y ${API_ORG_REQUESTS_PER_MINUTE} por organización (todas sus keys), informados en los headers \`X-RateLimit-*\`; ` +
        `\`POST /messages\`: ${API_SEND_PER_MINUTE_PER_ORG} por minuto y ${API_DAILY_SENDS_PER_ORG} por día por organización. Cuerpo máximo: ${Math.round(API_MAX_BODY_BYTES / 1024)} KB. ` +
        "Los errores tienen la forma `{ error: { code, message, details?, requestId } }` (también un 404 de ruta inexistente o un 405): ramifica por `code`; `details` lista cada campo inválido. " +
        "Cada respuesta lleva `X-Request-Id`: inclúyelo si escribes a soporte. Los POST aceptan `Idempotency-Key`.\n\n" +
        "**Versiones**: la versión va en la ruta (`/api/v1`). Dentro de v1 solo se agregan cosas (campos, endpoints, eventos, valores de enum); " +
        "un cambio incompatible saldría como `/api/v2` y v1 se mantendría al menos 12 meses, avisando por correo a los admins con keys activas. " +
        `Cada respuesta y cada entrega de webhook lleva \`${API_SCHEMA_VERSION_HEADER}: ${API_SCHEMA_VERSION}\` (fecha del contrato de datos vigente); los cambios están en \`x-colibly-changelog\`.\n\n` +
        "**Webhooks salientes**: cada entrega es un POST con el evento en el cuerpo y el header " +
        "`X-Colibly-Signature: t=<unix>,v1=<hex>`, donde v1 = HMAC-SHA256(secret, `${t}.${cuerpo}`). " +
        "Tras rotar el secreto con periodo de gracia el header trae una v1 por secreto (`t=…,v1=<nuevo>,v1=<anterior>`): acepta la entrega si cualquiera coincide. " +
        `Responde 2xx en menos de ${WEBHOOK_TIMEOUT_SECONDS} s; hay ${WEBHOOK_DELIVERY_ATTEMPTS} intentos con espera creciente. ` +
        "Headers de cada entrega: `X-Colibly-Event` (tipo), `X-Colibly-Event-Id` (id del evento, igual en todos los endpoints y reintentos: deduplica con él), " +
        `\`X-Colibly-Delivery\` (id de la entrega a ese endpoint), \`X-Colibly-Attempt\` (1 a ${WEBHOOK_DELIVERY_ATTEMPTS}) y \`${API_SCHEMA_VERSION_HEADER}\`. ` +
        "No hay orden garantizado entre eventos: ordena por `occurredAt` y, para estados de un mensaje, confía en que solo avanzan (`previousStatus`).",
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    "x-colibly-changelog": API_CHANGELOG,
    "x-colibly-limits": {
      requestsPerMinute: API_REQUESTS_PER_MINUTE,
      orgRequestsPerMinute: API_ORG_REQUESTS_PER_MINUTE,
      ipRequestsPerMinute: API_IP_REQUESTS_PER_MINUTE,
      sendsPerMinutePerOrg: API_SEND_PER_MINUTE_PER_ORG,
      dailySendsPerOrg: API_DAILY_SENDS_PER_ORG,
      conversationsListPerMinutePerKey: API_CONVERSATIONS_LIST_PER_MINUTE,
      maxBodyBytes: API_MAX_BODY_BYTES,
      unavailableRetrySeconds: API_UNAVAILABLE_RETRY_SECONDS,
      webhookPerEndpointConcurrency: WEBHOOK_PER_ENDPOINT_CONCURRENCY,
      badKeyAttemptsPerMinutePerIp: API_BAD_KEY_ATTEMPTS_PER_MINUTE,
      pageDefault: API_PAGE_DEFAULT,
      pageMax: API_PAGE_MAX,
      idempotencyTtlHours: IDEMPOTENCY_TTL_HOURS,
      webhookAttempts: WEBHOOK_DELIVERY_ATTEMPTS,
      webhookBackoffBaseSeconds: WEBHOOK_BACKOFF_BASE_MS / 1000,
      webhookTimeoutSeconds: WEBHOOK_TIMEOUT_SECONDS,
      webhookMaxConsecutiveFailures: WEBHOOK_MAX_CONSECUTIVE_FAILURES,
      maxActiveApiKeys: MAX_ACTIVE_API_KEYS,
      maxWebhooks: MAX_WEBHOOKS,
      webhookReplaysPerMinutePerOrg: API_WEBHOOK_REPLAYS_PER_MINUTE,
      webhookTestsPerMinutePerOrg: API_WEBHOOK_TESTS_PER_MINUTE,
    },
    "x-colibly-error-codes": API_ERROR_CODES,
    "x-colibly-events": WEBHOOK_EVENT_DOCS.map((e) => ({ ...e, example: exampleEvent(e.type, e.example) })),
    tags: [
      { name: "Cuenta", description: "Identidad de la key y cuentas a su alcance" },
      { name: "Contactos" },
      { name: "Conversaciones" },
      { name: "Mensajes" },
      { name: "Automatizaciones" },
      { name: "Catálogos", description: "Ids que piden los demás endpoints: plantillas, etiquetas, personas y automatizaciones" },
      { name: "Webhooks", description: "Administración de webhooks salientes por API" },
    ],
    paths: {
      "/me": {
        get: {
          tags: ["Cuenta"],
          summary: "Identidad de la API key",
          description: "Sin permiso especial. Útil para verificar la conexión.",
          responses: {
            "200": ok(ref("Me"), {
              key: { name: "ERP", prefix: "sk_live_AbC123", scopes: ["contacts:read", "messages:send"], expiresAt: null },
              owner: { id: "cmusr_01", name: "Luisa Admin", email: "admin@ejemplo.mx" },
              accountIds: ["cmacc_wa_01"],
              channelAccountIds: [],
            }),
            ...errors,
          },
        },
      },
      "/accounts": {
        get: {
          tags: ["Cuenta"],
          summary: "Cuentas al alcance de la key",
          description: "WhatsApp y demás canales que la key puede usar. Sin permiso especial.",
          responses: { "200": ok({ type: "object", properties: { data: { type: "array", items: ref("Account") } } }, { data: [EX.account] }), ...errors },
        },
      },
      "/contacts": {
        get: {
          tags: ["Contactos"],
          summary: "Listar contactos",
          description: `${scopeNote("contacts:read")} Más recientes primero.`,
          parameters: [
            ...pageParams,
            { name: "accountId", in: "query", schema: { type: "string" } },
            { name: "leadStatus", in: "query", schema: ref("LeadStatus") },
            { name: "tagId", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Nombre o teléfono" },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" }, description: "Para sincronizar: solo los modificados después de esta fecha" },
          ],
          "x-example-query": "limit=2&leadStatus=QUALIFIED",
          responses: { "200": ok(paged("Contact"), { data: [EX.contact], nextCursor: cursorExample }), ...errors },
        },
        post: {
          tags: ["Contactos"],
          summary: "Crear contacto de WhatsApp",
          description: `${scopeNote("contacts:write")} Idempotente por teléfono: 201 si lo creó, 200 si ya existía (no lo modifica). Respeta el límite de contactos del plan (402 plan_limit).`,
          parameters: [idempotencyParam],
          requestBody: {
            required: true,
            content: json(ref("ContactCreate"), { accountId: "cmacc_wa_01", phone: "5215598765432", name: "Ana López", leadStatus: "NEW", tags: ["Mayoreo"], customFields: { ciudad: "Puebla" } }),
          },
          responses: { "201": ok(ref("Contact"), EX.contact, "Creado"), "200": ok(ref("Contact"), EX.contact, "Ya existía"), ...writeErrors },
        },
      },
      "/contacts/{id}": {
        get: { tags: ["Contactos"], summary: "Obtener contacto", description: scopeNote("contacts:read"), parameters: [idParam], responses: { "200": ok(ref("Contact"), EX.contact), ...errors } },
        patch: {
          tags: ["Contactos"],
          summary: "Actualizar contacto",
          description: `${scopeNote("contacts:write")} Cambiar leadStatus dispara lo mismo que moverlo en el Pipeline (Meta CAPI, secuencias, webhooks).`,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("ContactUpdate"), { leadStatus: "CUSTOMER", customFields: { pedido: "A-1043" } }) },
          responses: { "200": ok(ref("Contact"), EX.contact), ...errors },
        },
      },
      "/contacts/{id}/tags": {
        post: {
          tags: ["Contactos"],
          summary: "Agregar etiqueta",
          description: `${scopeNote("contacts:write")} Por \`tagId\` o por \`name\` (uno de los dos); por nombre se crea si no existe. Devuelve el contacto.`,
          parameters: [idParam, idempotencyParam],
          requestBody: {
            required: true,
            content: json({ type: "object", properties: { tagId: { type: "string" }, name: { type: "string", maxLength: 60 } } }, { name: "Mayoreo" }),
          },
          responses: { "200": ok(ref("Contact"), EX.contact), ...writeErrors },
        },
        delete: {
          tags: ["Contactos"],
          summary: "Quitar etiqueta",
          description: scopeNote("contacts:write"),
          parameters: [idParam, { name: "tagId", in: "query", required: true, schema: { type: "string" } }],
          "x-example-query": "tagId=cmtag_01",
          responses: { "200": ok(ref("Contact"), EX.contact), ...errors },
        },
      },
      "/conversations": {
        get: {
          tags: ["Conversaciones"],
          summary: "Listar conversaciones",
          description: `${scopeNote("conversations:read")} Todos los canales, por último mensaje.`,
          parameters: [
            ...pageParams,
            { name: "accountId", in: "query", schema: { type: "string" } },
            { name: "channel", in: "query", schema: ref("Channel") },
            { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED"] } },
            { name: "assignedToId", in: "query", schema: { type: "string" } },
            { name: "teamId", in: "query", schema: { type: "string" }, description: "Solo las de ese equipo (GET /teams)" },
            { name: "contactId", in: "query", schema: { type: "string" } },
            { name: "updatedSince", in: "query", description: "Solo las que cambiaron desde esa fecha (mensaje, estado, asignación, no leídos). Guarda el mayor `updatedAt` recibido y úsalo en la siguiente consulta", schema: { type: "string", format: "date-time" } },
          ],
          "x-example-query": "status=OPEN&limit=20",
          responses: { "200": ok(paged("Conversation"), { data: [EX.conversation], nextCursor: null }), ...errors },
        },
      },
      "/conversations/{id}": {
        get: { tags: ["Conversaciones"], summary: "Obtener conversación", description: scopeNote("conversations:read"), parameters: [idParam], responses: { "200": ok(ref("Conversation"), EX.conversation), ...errors } },
        patch: {
          tags: ["Conversaciones"],
          summary: "Resolver, reabrir o asignar",
          description:
            `${scopeNote("conversations:write")} \`status\` y/o \`assignedToId\` (id de GET /users; \`null\` quita la asignación). Mismos efectos que en la bandeja: ` +
            "resolver deja de marcarla como \"esperando respuesta\", puede mandar la encuesta CSAT (WhatsApp) y emite `conversation.resolved`; asignar avisa a la persona y emite `conversation.assigned`. " +
            "Si la conversación tiene atributos obligatorios sin llenar, resolverla responde 422 required_fields. La persona asignada debe poder atender esa cuenta (si no, 400). Devuelve la conversación actualizada.",
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("ConversationUpdate"), { status: "RESOLVED", assignedToId: "cmusr_02" }) },
          responses: { "200": ok(ref("Conversation"), { ...EX.conversation, status: "RESOLVED" }), ...writeErrors },
        },
      },
      "/conversations/{id}/messages": {
        get: {
          tags: ["Conversaciones"],
          summary: "Mensajes de una conversación",
          description:
            `${scopeNote("conversations:read")} Sin \`since\`: recientes primero (por \`timestamp\`), para leer el historial hacia atrás. ` +
            "Con `since`: los guardados desde esa fecha (por `createdAt`), del más viejo al más nuevo, para ponerse al día.",
          parameters: [
            idParam,
            ...pageParams,
            { name: "since", in: "query", description: "Fecha ISO 8601: mensajes con `createdAt` ≥ since, en orden ascendente", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Message"), { data: [EX.message], nextCursor: null }), ...errors },
        },
      },
      "/messages/{id}/media": {
        get: {
          tags: ["Mensajes"],
          summary: "Descargar el medio de un mensaje",
          description: `${scopeNote("conversations:read")} Bytes del archivo (imagen, audio, video, sticker o documento), como descarga. Es la URL de \`message.media.url\`. 404 si el mensaje no tiene medio o aún se está bajando de Meta.`,
          parameters: [idParam],
          responses: { "200": { description: "El archivo (Content-Type real del medio)", headers: { ...rateHeaders, ...requestIdHeader }, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, ...errors },
        },
      },
      "/messages/{id}": {
        get: {
          tags: ["Mensajes"],
          summary: "Obtener un mensaje",
          description: `${scopeNote("conversations:read")} Cualquier canal, con su estado y su medio actuales (p. ej. para releer un \`media_placeholder\` del historial cuando ya llegó el medio).`,
          parameters: [idParam],
          responses: { "200": ok(ref("Message"), EX.message), ...errors },
        },
      },
      "/messages": {
        get: {
          tags: ["Mensajes"],
          summary: "Mensajes nuevos de todas las conversaciones",
          description:
            `${scopeNote("conversations:read")} Todo lo que Colibly guardó desde \`since\` en las conversaciones al alcance de la key (entrantes y salientes, cualquier canal), ` +
            "del más viejo al más nuevo por `createdAt`. Sirve para ponerse al día sin depender solo de los webhooks: guarda el `createdAt` del último mensaje recibido y úsalo como el siguiente `since` " +
            `(o sigue con \`nextCursor\`). Un cambio de estado no vuelve a traer el mensaje: llega por \`message.status_changed\` o con GET /messages/{id}. Límite propio: ${API_CONVERSATIONS_LIST_PER_MINUTE} por minuto por key.`,
          parameters: [
            { name: "since", in: "query", required: true, schema: { type: "string", format: "date-time" } },
            ...pageParams,
            { name: "accountId", in: "query", schema: { type: "string" } },
            { name: "direction", in: "query", schema: { type: "string", enum: ["INBOUND", "OUTBOUND"] } },
          ],
          "x-example-query": "since=2026-11-04T00:00:00Z&limit=50",
          responses: { "200": ok(paged("Message"), { data: [EX.message], nextCursor: null }), ...errors },
        },
        post: {
          tags: ["Mensajes"],
          summary: "Enviar mensaje",
          description:
            `${scopeNote("messages:send")} Destino: \`conversationId\` o \`contactId\`. En WhatsApp, texto y botones solo dentro de la ventana de 24 h ` +
            "(fuera de ella: 422 window_closed → usa una plantilla aprobada). Una plantilla a un contacto sin chat abre el chat. " +
            "**Manda siempre `Idempotency-Key`**: si reintentas por un timeout, el mensaje no sale dos veces.\n\n" +
            "**Archivos** (`type` image, document, audio o video): pasa `media.url`, una URL https pública; Colibly la descarga y la manda por el canal. Tipos y tamaños admitidos (los de WhatsApp, para que el mismo envío sirva en todos los canales): " +
            OUTBOUND_MEDIA_TYPES.map((t) => `${t} hasta ${OUTBOUND_MEDIA_RULES[t].maxBytes / (1024 * 1024)} MB (${OUTBOUND_MEDIA_RULES[t].mimeTypes.map((m) => m.split("/")[1]).join(", ")})`).join("; ") +
            ". Una URL que no responde, un tipo no admitido o un archivo muy grande dan 400 con `details[0].path = \"media.url\"`. El chat web todavía no recibe archivos, y Messenger e Instagram no admiten `caption`.",
          parameters: [idempotencyParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("SendMessage"),
                example: { conversationId: "cmchat_01", type: "text", text: "Sí, enviamos a todo México." },
                examples: {
                  texto: { summary: "Texto", value: { conversationId: "cmchat_01", type: "text", text: "Sí, enviamos a todo México." } },
                  documento: {
                    summary: "Documento por URL",
                    value: { conversationId: "cmchat_01", type: "document", media: { url: "https://erp.ejemplo.mx/facturas/A-1043.pdf", filename: "Factura A-1043.pdf" }, caption: "Tu factura" },
                  },
                  plantilla: { summary: "Plantilla", value: { contactId: "cmcon_01", type: "template", template: { id: "cmtpl_01", bodyParams: ["Ana", "A-1043"] } } },
                },
              },
            },
          },
          responses: {
            "201": ok(
              { type: "object", properties: { id: { type: "string" }, conversationId: { type: "string" }, externalId: { type: ["string", "null"], description: "id del mensaje en WhatsApp/canal" } } },
              { id: "cmmsg_02", conversationId: "cmchat_01", externalId: "wamid.HBgNNTIxNTU5ODc2NTQzMhUCABEYEjA" },
              "Enviado"
            ),
            "502": err("UpstreamError"),
            ...writeErrors,
          },
        },
      },
      "/automations/{id}/runs": {
        post: {
          tags: ["Automatizaciones"],
          summary: "Iniciar una automatización manual",
          description: `${scopeNote("automations:run")} Solo automatizaciones activas con disparador “Manual”. 409 si ya hay una ejecución en curso para ese contacto u otra automatización conversacional atiende su chat.`,
          parameters: [idParam, idempotencyParam],
          requestBody: {
            required: true,
            content: json(
              { type: "object", required: ["contactId"], properties: { contactId: { type: "string" }, vars: { type: "object", additionalProperties: { type: "string" }, description: "Disponibles como {{var.x}}" } } },
              { contactId: "cmcon_01", vars: { pedido: "A-1043" } }
            ),
          },
          responses: { "201": ok({ type: "object", properties: { runId: { type: "string" } } }, { runId: "cmrun_01" }, "Iniciada"), ...writeErrors },
        },
      },
      "/templates": {
        get: {
          tags: ["Catálogos"],
          summary: "Plantillas de WhatsApp",
          description:
            `${scopeNote("messages:send")} Plantillas de las cuentas de WhatsApp de la key, con lo que pide cada una en POST /messages (\`type: "template"\`): ` +
            "`params.bodyParamCount` valores en `bodyParams`, `headerParam` si `params.header` no es null (texto, o URL pública https si el formato es IMAGE, VIDEO o DOCUMENT) y `buttonParam` si `params.buttonParamRequired`. " +
            "Solo las `APPROVED` se pueden enviar. Lista completa, por nombre.",
          parameters: [
            { name: "accountId", in: "query", schema: str },
            { name: "status", in: "query", schema: str, description: "Estado de Meta: APPROVED, PENDING, REJECTED, PAUSED, DISABLED…" },
          ],
          "x-example-query": "status=APPROVED",
          responses: { "200": ok(list("Template"), { data: [EX.template] }), ...errors },
        },
      },
      "/templates/sync": {
        post: {
          tags: ["Catálogos"],
          summary: "Sincronizar plantillas con Meta",
          description:
            `${scopeNote("messages:send")} Consulta a Meta las plantillas de las cuentas de WhatsApp de la key (todas, o una con \`accountId\`) y devuelve la lista ya actualizada, con el formato de GET /templates. ` +
            "Úsalo después de crear una plantilla para ver su revisión (PENDING → APPROVED o REJECTED, con `statusReason`) sin esperar. Meta también avisa por webhook y Colibly refresca las pendientes solo; este es el atajo explícito. " +
            "`synced` lista las cuentas que respondieron y `failed` las que no. Las plantillas que Meta ya no devuelve quedan como DELETED (no se borran). Límite: 6 por minuto por organización.",
          parameters: [{ name: "accountId", in: "query", schema: str }],
          responses: {
            "200": ok(
              { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Template" } }, synced: { type: "array", items: str }, failed: { type: "array", items: { type: "object", properties: { accountId: str, error: str } } } } },
              { data: [EX.template], synced: ["cmacc_wa_01"], failed: [] }
            ),
            ...errors,
          },
        },
      },
      "/tags": {
        get: {
          tags: ["Catálogos"],
          summary: "Etiquetas",
          description: `${scopeNote("contacts:read")} Etiquetas de contacto de las cuentas de la key (cada cuenta tiene las suyas). Para \`GET /contacts?tagId=\` y \`POST /contacts/{id}/tags\`. Lista completa, por nombre.`,
          parameters: [{ name: "accountId", in: "query", schema: str }],
          responses: { "200": ok(list("Tag"), { data: [EX.tag] }), ...errors },
        },
      },
      "/users": {
        get: {
          tags: ["Catálogos"],
          summary: "Personas de la organización",
          description: `${scopeNote("conversations:read")} Para traducir \`assignedToId\` y para asignar con PATCH /conversations/{id}. Incluye las desactivadas (\`active: false\`), que pueden seguir en conversaciones viejas. Lista completa, por nombre.`,
          responses: { "200": ok(list("User"), { data: [EX.user] }), ...errors },
        },
      },
      "/teams": {
        get: {
          tags: ["Catálogos"],
          summary: "Equipos",
          description: `${scopeNote("conversations:read")} Equipos de la organización (Usuarios → Equipos), para traducir \`teamId\` y mover conversaciones con PATCH /conversations/{id}. Un equipo enruta la asignación automática; no da permisos. \`memberIds\` = personas activas. Lista completa, por nombre.`,
          responses: { "200": ok(list("Team"), { data: [EX.team] }), ...errors },
        },
      },
      "/automations": {
        get: {
          tags: ["Catálogos"],
          summary: "Automatizaciones",
          description: `${scopeNote("automations:run")} Automatizaciones de las cuentas de la key (sin archivadas). \`runnable: true\` = activa con disparador "Manual": la que acepta POST /automations/{id}/runs. Lista completa, por nombre.`,
          parameters: [
            { name: "accountId", in: "query", schema: str },
            { name: "runnable", in: "query", schema: { type: "string", enum: ["true"] }, description: "Solo las que se pueden iniciar por API" },
          ],
          "x-example-query": "runnable=true",
          responses: { "200": ok(list("Automation"), { data: [EX.automation] }), ...errors },
        },
      },
      "/webhooks": {
        get: {
          tags: ["Webhooks"],
          summary: "Listar webhooks",
          description: scopeNote("webhooks:manage"),
          responses: { "200": ok({ type: "object", properties: { data: { type: "array", items: ref("Webhook") } } }, { data: [EX.webhook] }), ...errors },
        },
        post: {
          tags: ["Webhooks"],
          summary: "Crear webhook",
          description: `${scopeNote("webhooks:manage")} La respuesta incluye \`secret\` (whsec_...) una sola vez: guárdalo para verificar la firma. Máximo ${MAX_WEBHOOKS} webhooks por cuenta (409 limit_reached).`,
          requestBody: { required: true, content: json(ref("WebhookCreate"), { name: "ERP pedidos", url: "https://erp.ejemplo.mx/colibly/eventos", events: ["contact.created", "contact.lead_status_changed"] }) },
          responses: { "201": ok(ref("Webhook"), { ...EX.webhook, secret: "whsec_9fK2…" }, "Creado"), ...writeErrors },
        },
      },
      "/webhooks/{id}": {
        get: { tags: ["Webhooks"], summary: "Obtener webhook", description: scopeNote("webhooks:manage"), parameters: [idParam], responses: { "200": ok(ref("Webhook"), EX.webhook), ...errors } },
        patch: {
          tags: ["Webhooks"],
          summary: "Editar / reactivar webhook",
          description:
            `${scopeNote("webhooks:manage")} \`active: true\` reactiva uno desactivado por fallos (reinicia el contador). ` +
            "Uno con `status: paused` (su creador dejó de ser admin) solo se reactiva con `takeOwnership: true`: pasa a ser del dueño de la key.",
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("WebhookUpdate"), { active: true, takeOwnership: true }) },
          responses: { "200": ok(ref("Webhook"), EX.webhook), ...errors },
        },
        delete: {
          tags: ["Webhooks"],
          summary: "Eliminar webhook",
          description: `${scopeNote("webhooks:manage")} Borra también su registro de entregas.`,
          parameters: [idParam],
          responses: { "200": ok({ type: "object", properties: { deleted: { type: "boolean" } } }, { deleted: true }), ...errors },
        },
      },
      "/webhooks/{id}/test": {
        post: {
          tags: ["Webhooks"],
          summary: "Enviar un evento de prueba",
          description:
            `${scopeNote("webhooks:manage")} Entrega un evento \`webhook.test\` firmado a ese endpoint, como una entrega real (reintentos e historial incluidos), para validar la URL y tu verificación de firma. ` +
            `Su resultado se lee en GET /webhooks/{id}/deliveries/{deliveryId}. Un webhook desactivado responde 409. Límite: ${API_WEBHOOK_TESTS_PER_MINUTE} por minuto por organización.`,
          parameters: [idParam],
          responses: {
            "202": ok({ type: "object", properties: { deliveryId: str, status: { type: "string", enum: ["pending"] } } }, { deliveryId: EX.delivery.id, status: "pending" }, "Encolada"),
            "409": err("Conflict"),
            ...errors,
          },
        },
      },
      "/webhooks/{id}/rotate-secret": {
        post: {
          tags: ["Webhooks"],
          summary: "Rotar el secreto",
          description:
            `${scopeNote("webhooks:manage")} Genera un secreto nuevo y lo devuelve (única vez que se ve). Sin cuerpo (o \`graceHours: 0\`) el anterior deja de firmar de inmediato. ` +
            `Con \`graceHours\` (1 a ${WEBHOOK_ROTATION_MAX_GRACE_HOURS}) el anterior sigue firmando ese tiempo: cada entrega lleva \`t=…,v1=<nuevo>,v1=<anterior>\`, así que puedes cambiar el secreto de tu receptor sin perder entregas ` +
            "(tu verificador debe aceptar si cualquiera de las v1 coincide; las recetas de la documentación ya lo hacen). Rotar otra vez descarta el más viejo.",
          parameters: [idParam],
          requestBody: {
            required: false,
            content: json(
              { type: "object", additionalProperties: false, properties: { graceHours: { type: "integer", minimum: 0, maximum: WEBHOOK_ROTATION_MAX_GRACE_HOURS, default: 0 } } },
              { graceHours: 24 }
            ),
          },
          responses: {
            "200": ok(
              {
                type: "object",
                properties: {
                  id: str,
                  secret: { type: "string", description: "whsec_…" },
                  previousSecretExpiresAt: { type: ["string", "null"], format: "date-time", description: "Hasta cuándo firma también el anterior; null = ya no firma" },
                },
              },
              { id: EX.webhook.id, secret: "whsec_Q7v…", previousSecretExpiresAt: "2026-11-06T16:00:00.000Z" }
            ),
            ...errors,
          },
        },
      },
      "/webhooks/{id}/deliveries": {
        get: {
          tags: ["Webhooks"],
          summary: "Historial de entregas",
          description: `${scopeNote("webhooks:manage")} Entregas del endpoint, las más recientes primero (se guardan 30 días). Sin el cuerpo: pídelo con GET /webhooks/{id}/deliveries/{deliveryId}.`,
          parameters: [
            idParam,
            ...pageParams,
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "sent", "failed"] } },
            { name: "eventType", in: "query", schema: { type: "string" } },
            { name: "since", in: "query", description: "Solo las creadas desde esa fecha", schema: { type: "string", format: "date-time" } },
          ],
          "x-example-query": "status=failed&limit=20",
          responses: { "200": ok(paged("WebhookDelivery"), { data: [EX.delivery], nextCursor: null }), ...errors },
        },
      },
      "/webhooks/{id}/deliveries/{deliveryId}": {
        get: {
          tags: ["Webhooks"],
          summary: "Obtener una entrega",
          description: `${scopeNote("webhooks:manage")} Con \`payload\`: el cuerpo exacto que se envió (lo que firma X-Colibly-Signature).`,
          parameters: [idParam, deliveryIdParam],
          responses: {
            "200": ok(
              { allOf: [ref("WebhookDelivery"), { type: "object", properties: { payload: ref("Event") } }] },
              { ...EX.delivery, payload: exampleEvent("message.status_changed", EVENT_DATA["message.status_changed"].example) }
            ),
            ...errors,
          },
        },
      },
      "/webhooks/{id}/deliveries/{deliveryId}/replay": {
        post: {
          tags: ["Webhooks"],
          summary: "Reenviar una entrega",
          description:
            `${scopeNote("webhooks:manage")} Vuelve a entregar el mismo evento (mismo cuerpo y mismo \`X-Colibly-Event-Id\`, intentos desde cero) a ese endpoint. ` +
            `Para entregas fallidas o ya entregadas; una en curso o un webhook desactivado responde 409 conflict. Límite: ${API_WEBHOOK_REPLAYS_PER_MINUTE} por minuto por organización.`,
          parameters: [idParam, deliveryIdParam, idempotencyParam],
          responses: {
            "202": ok({ type: "object", properties: { id: str, status: { type: "string", enum: ["pending"] } } }, { id: EX.delivery.id, status: "pending" }, "Encolada"),
            ...errors,
          },
        },
      },
    },
    webhooks: {
      event: {
        post: {
          summary: "Evento entregado a tu URL",
          description: WEBHOOK_EVENT_DOCS.map((e) => `- \`${e.type}\`: ${e.description}`).join("\n"),
          parameters: [
            { name: "X-Colibly-Signature", in: "header", required: true, schema: { type: "string" }, description: "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${cuerpo}`)>; durante el periodo de gracia de una rotación, una v1 por secreto (acepta si cualquiera coincide)" },
            { name: "X-Colibly-Event", in: "header", required: true, schema: { type: "string" } },
            { name: "X-Colibly-Delivery", in: "header", required: true, schema: { type: "string" }, description: "Id de la entrega; se repite en los reintentos" },
            { name: "X-Colibly-Event-Id", in: "header", required: true, schema: { type: "string" }, description: "Id del evento (igual a `id` del cuerpo): el mismo en todos los endpoints y reintentos" },
            { name: "X-Colibly-Attempt", in: "header", required: true, schema: { type: "integer", minimum: 1, maximum: WEBHOOK_DELIVERY_ATTEMPTS }, description: "Número de intento de esta entrega" },
            { name: API_SCHEMA_VERSION_HEADER, in: "header", required: true, schema: { type: "string", example: API_SCHEMA_VERSION }, description: "Versión del contrato de datos (ver x-colibly-changelog)" },
          ],
          requestBody: { content: json(ref("Event"), exampleEvent("contact.lead_status_changed", EVENT_DATA["contact.lead_status_changed"].example)) },
          responses: { "200": { description: `Recibido (cualquier 2xx en menos de ${WEBHOOK_TIMEOUT_SECONDS} s)` } },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: `Permisos disponibles: ${Object.entries(API_SCOPES).map(([k, v]) => `\`${k}\` (${v})`).join(", ")}.`,
        },
      },
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 255 },
          description:
            `Clave única por operación (p. ej. un UUID). Durante ${IDEMPOTENCY_TTL_HOURS} h, repetir la solicitud con la misma clave y el mismo cuerpo devuelve la respuesta original ` +
            "(con el header `Idempotent-Replayed: true`) sin repetir la operación. Misma clave con otro cuerpo → 422 idempotency_conflict; " +
            "mientras la primera sigue en proceso → 409 conflict. Los errores 401, 402, 403, 429 y 5xx no se guardan: puedes reintentar con la misma clave.",
        },
      },
      headers: {
        RateLimitLimit: { description: "Solicitudes permitidas por minuto", schema: { type: "integer", example: API_REQUESTS_PER_MINUTE } },
        RateLimitRemaining: { description: "Solicitudes que quedan en la ventana actual", schema: { type: "integer" } },
        RateLimitReset: { description: "Segundos hasta que se libera un lugar", schema: { type: "integer" } },
        RetryAfter: { description: "Segundos a esperar antes de reintentar", schema: { type: "integer" } },
        RequestId: { description: "Id de esta solicitud (también en `error.requestId`): inclúyelo si escribes a soporte", schema: { type: "string", example: "req_4fQm1x9TzK2bLw7a" } },
        RateLimitScope: {
          description: "Límite informado en X-RateLimit-*: el más ajustado, o el que rechazó en un 429",
          schema: { type: "string", enum: ["key", "organization", "ip", "endpoint", "daily"] },
        },
      },
      responses: {
        InvalidRequest: errorResponse("Solicitud inválida", "invalid_request", "template.id: Entrada inválida: se esperaba texto, recibido indefinido", undefined, [
          { path: "template.id", message: "Entrada inválida: se esperaba texto, recibido indefinido" },
        ]),
        Unauthorized: errorResponse("Sin API key válida", "unauthorized", "API key inválida, revocada o expirada"),
        PaymentRequired: errorResponse("plan_limit o read_only", "plan_limit", "La API está incluida en el plan Pro. Mejora el plan de tu cuenta para usarla."),
        Forbidden: errorResponse("Falta un permiso", "forbidden", "Esta API key no tiene el permiso messages:send"),
        NotFound: errorResponse("No encontrado", "not_found", "Contacto no encontrado"),
        Conflict: errorResponse("Conflicto", "conflict", "Una solicitud con esta Idempotency-Key sigue en proceso. Reintenta en unos segundos."),
        Unprocessable: errorResponse("window_closed o idempotency_conflict", "window_closed", "Fuera de la ventana de 24 h: envía una plantilla aprobada"),
        RateLimited: errorResponse("Demasiadas solicitudes", "rate_limited", `Límite de ${API_REQUESTS_PER_MINUTE} solicitudes por minuto excedido`, {
          ...rateHeaders,
          "Retry-After": { $ref: "#/components/headers/RetryAfter" },
        }),
        PayloadTooLarge: errorResponse("Cuerpo demasiado grande", "payload_too_large", `El cuerpo supera el máximo de ${Math.round(API_MAX_BODY_BYTES / 1024)} KB`),
        ServiceUnavailable: errorResponse("No disponible temporalmente", "service_unavailable", "Servicio temporalmente no disponible; reintenta en unos segundos", {
          "Retry-After": { $ref: "#/components/headers/RetryAfter" },
        }),
        InternalError: errorResponse("Error interno", "internal_error", "Error interno del servidor"),
        UpstreamError: errorResponse("El canal rechazó el envío", "upstream_error", "WhatsApp rechazó el mensaje"),
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: API_ERROR_CODES.map((e) => e.code) },
                message: { type: "string", description: "En español, para mostrar o registrar; ramifica por `code`" },
                details: {
                  type: "array",
                  description: "Solo en errores de validación: cada problema con la ruta del campo (`template.id`, `buttons.0.title`; vacía = el cuerpo entero)",
                  items: { type: "object", required: ["path", "message"], properties: { path: str, message: str } },
                },
                requestId: { type: "string", description: "Igual al header X-Request-Id" },
              },
            },
          },
        },
        LeadStatus: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"] },
        Channel: { type: "string", enum: ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"] },
        Me: {
          type: "object",
          properties: {
            key: { type: "object", properties: { name: str, prefix: str, scopes: { type: "array", items: str }, expiresAt: { type: ["string", "null"], format: "date-time" } } },
            owner: { type: "object", properties: { id: str, name: strNull, email: str } },
            accountIds: { type: "array", items: str, description: "Cuentas de WhatsApp al alcance" },
            channelAccountIds: { type: "array", items: str, description: "Cuentas de otros canales al alcance" },
          },
        },
        Account: {
          type: "object",
          properties: {
            id: str,
            channel: ref("Channel"),
            name: str,
            phoneNumber: { ...strNull, description: "Solo WhatsApp, como lo muestra Meta (p. ej. \"+52 1 55 1234 5678\")" },
            phoneE164: { ...strNull, description: "Solo WhatsApp: el mismo número en E.164 (+525512345678)" },
            status: str,
          },
        },
        Contact: {
          type: "object",
          properties: {
            id: str,
            accountId: str,
            channel: ref("Channel"),
            name: strNull,
            realName: strNull,
            phone: { ...strNull, description: "Solo WhatsApp: el wa_id de Meta tal cual (en México suele traer el \"1\" móvil: 521…)" },
            phoneE164: { ...strNull, description: "Solo WhatsApp: el número en E.164 para cruzar con otros sistemas (+52 + 10 dígitos en México)" },
            externalId: { ...strNull, description: "Id del contacto en Telegram/Messenger/Instagram/Web" },
            leadStatus: ref("LeadStatus"),
            leadOrigin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
            adId: { ...strNull, description: "Anuncio de origen (CTWA o Instant Form), first-touch" },
            ctwaClid: { ...strNull, description: "Click id del anuncio click-to-WhatsApp (solo CTWA)" },
            dealValueCents: { type: ["integer", "null"], description: "Valor del trato en centavos (MXN)" },
            dealCurrency: { type: "string", enum: ["MXN"] },
            expectedCloseAt: { type: ["string", "null"], format: "date-time", description: "Fecha estimada de cierre" },
            optedOutMarketing: { type: "boolean" },
            tags: { type: "array", items: { type: "object", properties: { id: str, name: str } } },
            customFields: { type: "object", additionalProperties: strNull },
            conversationId: strNull,
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ContactCreate: {
          type: "object",
          required: ["accountId", "phone"],
          properties: {
            accountId: { type: "string", description: "Cuenta de WhatsApp" },
            phone: { type: "string", description: "Con código de país, p. ej. 5215512345678 o +52 55 1234 5678 (8 a 15 dígitos). En México 52… y 521… son el mismo contacto" },
            name: { type: "string", maxLength: 200 },
            leadStatus: ref("LeadStatus"),
            tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 }, description: "Nombres; se crean si no existen" },
            customFields: { type: "object", additionalProperties: strNull, description: "Por key del campo" },
          },
        },
        ContactUpdate: {
          type: "object",
          minProperties: 1,
          properties: {
            name: { type: "string", maxLength: 200 },
            realName: strNull,
            leadStatus: ref("LeadStatus"),
            customFields: { type: "object", additionalProperties: strNull, description: "null o \"\" borra el valor" },
            dealValueCents: { type: ["integer", "null"], minimum: 0, maximum: 2_000_000_000, description: "Valor del trato en centavos de MXN; null lo borra" },
            expectedCloseAt: { type: ["string", "null"], format: "date-time", description: "Fecha estimada de cierre; null la borra" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            id: str,
            accountId: str,
            channel: ref("Channel"),
            contactId: strNull,
            name: strNull,
            status: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED"] },
            assignedToId: strNull,
            teamId: { ...strNull, description: "Equipo que la atiende (GET /teams)" },
            unreadCount: { type: "integer" },
            lastMessage: strNull,
            lastMessageAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time", description: "Último cambio (mensaje, estado, asignación…); punto de control de updatedSince" },
          },
        },
        Message: {
          type: "object",
          properties: {
            id: str,
            conversationId: str,
            direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] },
            type: str,
            text: strNull,
            caption: strNull,
            mimeType: strNull,
            filename: strNull,
            status: { ...strNull, description: "Salientes: sent, delivered, read, failed (null en salientes antiguos de la app WhatsApp Business y en entrantes)" },
            senderId: { ...strNull, description: "Usuario de Colibly que lo mandó o lo disparó" },
            interactive: { description: "Botones o lista, si aplica" },
            timestamp: { type: "string", format: "date-time" },
            externalId: { ...strNull, description: "Id del mensaje en el canal (wamid en WhatsApp)" },
            content: {
              type: ["object", "null"],
              description: "Lo que no cabe en text/caption/media. Según el tipo: location {latitude, longitude, name, address, url}; contacts [{name, phones[{phone, waId, type}], emails, company}]; order {catalogId, text, items[{productId, quantity, price, currency}]}; system {type, body, newWaId}; errors [{code, title, detail}]; media {sha256, voice, animated}; forwarded; frequentlyForwarded; referredProduct; replyToFrom; placeholder {reason: \"history_media\"} en un media_placeholder del historial (el medio llega después al mismo mensaje)",
            },
            media: {
              type: ["object", "null"],
              description: "Medio del mensaje. Descárgalo de `url` con tu API key (GET /messages/{id}/media); ready=false mientras Colibly lo baja de Meta",
              properties: {
                url: str,
                ready: { type: "boolean" },
                mimeType: strNull,
                filename: strNull,
                size: { type: ["integer", "null"] },
                sha256: { ...strNull, description: "El de Meta, en base64 (solo entrantes de WhatsApp)" },
                sha256Hex: { ...strNull, description: "sha256 en hex de los bytes que entrega `url`, calculado por Colibly (todos los canales y direcciones, desde 2026-11-04)" },
              },
            },
            replyTo: { type: ["object", "null"], description: "Mensaje citado", properties: { externalId: str, messageId: strNull, from: strNull } },
            reaction: { type: ["object", "null"], properties: { contact: strNull, agent: strNull } },
            transcript: { ...strNull, description: "Transcripción de una nota de voz" },
            error: {
              type: ["object", "null"],
              description: "Salientes fallidos. message = motivo en español; title, details y href = los de Meta (desde 2026-11-04)",
              properties: { code: { type: ["integer", "null"] }, message: strNull, title: strNull, details: strNull, href: strNull },
            },
            deliveredAt: { type: ["string", "null"], format: "date-time", description: "Hora de entrega según WhatsApp" },
            readAt: { type: ["string", "null"], format: "date-time", description: "Hora de lectura según WhatsApp" },
            pricing: { type: ["object", "null"], properties: { billable: { type: ["boolean", "null"] }, model: strNull, category: strNull, type: strNull } },
            origin: { type: ["string", "null"], enum: [...OUTBOUND_ORIGINS, "contact", null], description: `${ORIGIN_DOC}; contact = entrante. null = saliente antiguo sin datos para saberlo` },
            sentBy: { type: ["string", "null"], enum: ["contact", "user", "bot", "business_app", "system", null], description: SENT_BY_DOC },
            senderName: { ...strNull, description: "Nombre del usuario de senderId" },
            referral: {
              type: ["object", "null"],
              description: "Entrante que llegó de un anuncio click-to-WhatsApp (solo WhatsApp)",
              properties: { sourceType: { ...strNull, description: "ad o post" }, sourceId: strNull, sourceUrl: strNull, headline: strNull, body: strNull, mediaType: strNull, ctwaClid: strNull },
            },
            createdAt: { type: "string", format: "date-time", description: "Cuándo lo guardó Colibly (timestamp es la hora del canal). Punto de control de `since`" },
          },
        },
        SendMessage: {
          type: "object",
          required: ["type"],
          description: "Envía conversationId o contactId (uno de los dos).",
          properties: {
            conversationId: str,
            contactId: str,
            type: { type: "string", enum: ["text", "buttons", "template", ...OUTBOUND_MEDIA_TYPES] },
            text: { type: "string", maxLength: 4096, description: "Requerido para text y buttons" },
            buttons: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "object", required: ["title"], properties: { id: str, title: { type: "string", maxLength: 20 } } },
            },
            template: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string", description: `Id de la plantilla en ${BRAND_NAME}` },
                bodyParams: { type: "array", maxItems: 20, items: str },
                headerParam: strNull,
                buttonParam: strNull,
              },
            },
            media: {
              type: "object",
              required: ["url"],
              additionalProperties: false,
              description: "Requerido para image, document, audio y video. Colibly descarga la URL al enviar (sin redirecciones, 30 s como máximo).",
              properties: {
                url: { type: "string", format: "uri", description: "https pública del archivo" },
                filename: { type: "string", maxLength: 200, description: "Nombre que verá el cliente (documentos). Por defecto, el de la URL" },
                mimeType: { type: "string", description: "Tipo del archivo si tu servidor no lo informa bien (p. ej. responde application/octet-stream)" },
              },
            },
            caption: { type: "string", maxLength: 1024, description: "Texto junto al archivo (image, video, document). No en audio, ni en Messenger/Instagram" },
          },
        },
        ConversationUpdate: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED"] },
            assignedToId: { ...strNull, description: "Id de GET /users; null quita la asignación" },
            teamId: { ...strNull, description: "Id de GET /teams; null la saca de su equipo. Si la conversación no tiene a nadie asignado, se asigna dentro del equipo (si la cuenta tiene la asignación automática); un assignedToId en el mismo cuerpo gana" },
          },
        },
        Template: {
          type: "object",
          properties: {
            id: { type: "string", description: "El `template.id` de POST /messages" },
            accountId: str,
            name: { type: "string", description: "Nombre en Meta" },
            language: { type: "string", example: "es_MX" },
            category: { type: "string", description: "MARKETING, UTILITY o AUTHENTICATION" },
            status: { type: "string", description: "Estado en Meta (APPROVED, PENDING, IN_APPEAL, REJECTED, PAUSED, DISABLED, DELETED…); solo APPROVED se envía" },
            statusReason: { ...strNull, description: "Motivo corto de un rechazo, pausa o aviso de calidad; null si no hay" },
            params: {
              type: "object",
              properties: {
                bodyParamCount: { type: "integer", description: "Cuántos valores van en bodyParams ({{1}}, {{2}}…)" },
                header: { type: ["object", "null"], properties: { format: { type: "string", enum: ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] } }, description: "null = no pide headerParam" },
                buttonParamRequired: { type: "boolean", description: "true = pide buttonParam (sufijo del botón URL)" },
              },
            },
            bodyText: { ...strNull, description: "Texto del cuerpo con sus {{n}}" },
            syncedAt: { type: "string", format: "date-time", description: "Última sincronización con Meta" },
          },
        },
        Tag: {
          type: "object",
          properties: { id: str, accountId: str, name: str, color: { type: "string", description: "Nombre del tono en la app" }, createdAt: { type: "string", format: "date-time" } },
        },
        Team: {
          type: "object",
          properties: { id: str, name: str, memberIds: { type: "array", items: str }, createdAt: { type: "string", format: "date-time" } },
        },
        User: {
          type: "object",
          properties: {
            id: str,
            name: strNull,
            email: str,
            role: { type: "string", enum: ["admin", "user", "ejecutivo"] },
            active: { type: "boolean", description: "false = desactivada (no se le puede asignar)" },
          },
        },
        Automation: {
          type: "object",
          properties: {
            id: str,
            accountId: str,
            name: str,
            description: strNull,
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "PAUSED"] },
            triggerType: { ...strNull, description: "manual, message_received, tag_added…" },
            runnable: { type: "boolean", description: "true = acepta POST /automations/{id}/runs" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        WebhookCreate: {
          type: "object",
          required: ["name", "url", "events"],
          properties: {
            name: { type: "string", maxLength: 80 },
            url: { type: "string", format: "uri", description: "https:// y pública (no se aceptan direcciones internas)" },
            events: { type: "array", minItems: 1, items: { type: "string", enum: ["*", ...Object.keys(DOMAIN_EVENT_CATALOG)] }, description: "\"*\" = todos" },
            accountIds: { type: "array", items: str, description: "Vacío = todas" },
            channelAccountIds: { type: "array", items: str },
          },
        },
        WebhookUpdate: {
          type: "object",
          properties: {
            name: { type: "string", maxLength: 80 },
            url: { type: "string", format: "uri" },
            events: { type: "array", items: str },
            accountIds: { type: "array", items: str },
            channelAccountIds: { type: "array", items: str },
            active: { type: "boolean" },
            takeOwnership: { type: "boolean", description: "Pasa el webhook al dueño de la key; obligatorio para reactivar uno pausado" },
          },
        },
        WebhookDelivery: {
          type: "object",
          properties: {
            id: str,
            eventId: { type: "string", description: "Igual a `id` del evento y al header X-Colibly-Event-Id" },
            eventType: str,
            status: { type: "string", enum: ["pending", "sent", "failed"] },
            attempts: { type: "integer" },
            responseCode: { type: ["integer", "null"], description: "Último código HTTP de tu servidor" },
            error: strNull,
            createdAt: { type: "string", format: "date-time" },
            deliveredAt: { type: ["string", "null"], format: "date-time" },
          },
        },
        Webhook: {
          type: "object",
          properties: {
            id: str,
            name: str,
            url: str,
            events: { type: "array", items: str },
            accountIds: { type: "array", items: str },
            channelAccountIds: { type: "array", items: str },
            active: { type: "boolean" },
            status: {
              type: "string",
              enum: ["active", "paused", "disabled", "inactive"],
              description: "paused = su creador dejó de ser admin; disabled = se apagó solo tras fallos seguidos; inactive = lo apagó un admin",
            },
            ownerId: { type: "string", description: "Usuario dueño: las entregas usan su alcance de cuentas" },
            pausedAt: { type: ["string", "null"], format: "date-time" },
            pausedReason: strNull,
            disabledAt: { type: ["string", "null"], format: "date-time" },
            consecutiveFailures: { type: "integer" },
            lastDeliveryAt: { type: ["string", "null"], format: "date-time" },
            previousSecretExpiresAt: { type: ["string", "null"], format: "date-time", description: "Tras rotar con periodo de gracia: hasta cuándo el secreto anterior también firma" },
            createdAt: { type: "string", format: "date-time" },
            secret: { type: "string", description: "Solo en la respuesta de creación" },
          },
        },
        Event: {
          type: "object",
          required: ["id", "type", "occurredAt", "data"],
          properties: {
            id: { type: "string", description: "Único por evento: úsalo para descartar duplicados" },
            type: { type: "string", enum: WEBHOOK_EVENT_DOCS.map((e) => e.type) },
            occurredAt: { type: "string", format: "date-time" },
            account: { type: ["object", "null"], properties: { id: str, channel: ref("Channel"), name: str, phoneNumber: strNull, phoneE164: strNull } },
            contact: {
              type: ["object", "null"],
              properties: {
                id: str,
                name: { ...strNull, description: "realName si el equipo lo puso; si no, el nombre del perfil" },
                realName: strNull,
                tags: { type: "array", items: { type: "object", properties: { id: str, name: str } } },
                phone: { ...strNull, description: "wa_id de Meta tal cual" },
                phoneE164: strNull,
                externalId: strNull,
                leadStatus: ref("LeadStatus"),
                leadOrigin: str,
              },
              description: "Datos del momento de la entrega",
            },
            conversation: { type: ["object", "null"], properties: { id: str, channel: ref("Channel"), status: str, assignedToId: strNull } },
            data: { type: "object", description: "Depende del tipo; ver x-colibly-events" },
            message: { ...ref("Message"), description: "Solo en message.*: el mensaje con la misma forma que GET /conversations/{id}/messages, leído al entregar" },
          },
        },
      },
    },
  };
}

export type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;
