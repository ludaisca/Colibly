import { API_SCOPES } from "./scopes";
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

export const API_VERSION = "1.0.0";

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
const ok = (schema: object, example?: unknown, description = "OK") => ({ description, headers: rateHeaders, content: json(schema, example) });
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
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: API_PAGE_MAX, default: API_PAGE_DEFAULT } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` de la página anterior" },
];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const idempotencyParam = { $ref: "#/components/parameters/IdempotencyKey" };
const scopeNote = (scope: string) => `Requiere el permiso \`${scope}\`.`;

// ─── Ejemplos (los usa la referencia de /docs/api) ──────────────────────────
const EX = {
  account: { id: "cmacc_wa_01", channel: "WHATSAPP", name: "Ventas CDMX", phoneNumber: "5215512345678", status: "CONNECTED" },
  contact: {
    id: "cmcon_01",
    accountId: "cmacc_wa_01",
    channel: "WHATSAPP",
    name: "Ana López",
    realName: null,
    phone: "5215598765432",
    externalId: null,
    leadStatus: "QUALIFIED",
    leadOrigin: "ORGANIC",
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
    unreadCount: 1,
    lastMessage: "¿Tienen envío a Puebla?",
    lastMessageAt: "2026-10-18T19:02:11.000Z",
    createdAt: "2026-10-01T16:20:00.000Z",
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
    createdAt: "2026-10-01T15:00:00.000Z",
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
    data: obj({ messageId: str, messageType: str, text: strNull, source: { type: "string", enum: ["agent", "api", "automation"] }, senderId: strNull }),
    example: { messageId: "cmmsg_02", messageType: "text", text: "Sí, enviamos a todo México.", source: "agent", senderId: "cmusr_02" },
  },
  "contact.created": {
    data: obj({
      origin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
      source: {
        type: "string",
        enum: ["inbound", "api", "lead_ads", "history", "echo"],
        description: "inbound = escribió el contacto; api = POST /contacts; lead_ads = formulario de Meta; history = importación del historial de WhatsApp Business; echo = el negocio escribió primero desde la app WhatsApp Business",
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
    account: test ? null : { id: EX.account.id, channel: "WHATSAPP", name: EX.account.name },
    contact: test
      ? null
      : { id: EX.contact.id, name: EX.contact.name, phone: EX.contact.phone, externalId: null, leadStatus: EX.contact.leadStatus, leadOrigin: "ORGANIC" },
    conversation: test || type === "contact.created" ? null : { id: EX.conversation.id, channel: "WHATSAPP", status: "OPEN", assignedToId: "cmusr_02" },
    data,
  };
}

// ─── Errores ────────────────────────────────────────────────────────────────
export const API_ERROR_CODES: { code: string; status: number; description: string }[] = [
  { code: "invalid_request", status: 400, description: "Cuerpo o parámetros inválidos; `message` dice cuál." },
  { code: "unauthorized", status: 401, description: "Falta la API key, es inválida, está revocada o vencida, o su dueño ya no es admin." },
  { code: "plan_limit", status: 402, description: "La API es del plan Pro, o se alcanzó un límite del plan (p. ej. contactos)." },
  { code: "read_only", status: 402, description: "Cuenta en solo lectura (prueba vencida o pago pendiente): solo GET." },
  { code: "forbidden", status: 403, description: "La key no tiene el permiso que pide el endpoint." },
  { code: "not_found", status: 404, description: "No existe o no está al alcance de la key." },
  { code: "conflict", status: 409, description: "Choca con el estado actual (p. ej. automatización ya en curso, o la misma Idempotency-Key sigue en proceso)." },
  { code: "limit_reached", status: 409, description: `Tope por cuenta: ${MAX_WEBHOOKS} webhooks.` },
  { code: "window_closed", status: 422, description: "WhatsApp: fuera de la ventana de 24 h solo se puede enviar una plantilla aprobada." },
  { code: "idempotency_conflict", status: 422, description: "La Idempotency-Key ya se usó con otro cuerpo o en otro endpoint." },
  { code: "payload_too_large", status: 413, description: `El cuerpo supera ${Math.round(API_MAX_BODY_BYTES / 1024)} KB.` },
  { code: "rate_limited", status: 429, description: "Demasiadas solicitudes (por key, organización, IP o endpoint; ver `X-RateLimit-Scope`); espera los segundos de `Retry-After`." },
  { code: "daily_limit_reached", status: 429, description: `Cupo diario de ${API_DAILY_SENDS_PER_ORG} envíos por API por organización (día UTC); \`Retry-After\` indica cuándo se renueva.` },
  { code: "internal_error", status: 500, description: "Error nuestro. Reintenta con la misma Idempotency-Key." },
  { code: "upstream_error", status: 502, description: "WhatsApp/Meta u otro canal rechazó o no respondió." },
  { code: "service_unavailable", status: 503, description: "Servicio temporalmente no disponible (p. ej. el limitador de velocidad); reintenta tras `Retry-After`." },
];

const errorResponse = (description: string, code: string, message: string, headers?: object) => ({
  description,
  ...(headers ? { headers } : {}),
  content: json(ref("Error"), { error: { code, message } }),
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
        "Los errores tienen la forma `{ error: { code, message } }`. Los POST aceptan `Idempotency-Key`.\n\n" +
        "**Versiones**: la versión va en la ruta (`/api/v1`). Dentro de v1 solo se agregan cosas (campos, endpoints, eventos, valores de enum); " +
        "un cambio incompatible saldría como `/api/v2` y v1 se mantendría al menos 12 meses, avisando por correo a los admins con keys activas.\n\n" +
        "**Webhooks salientes**: cada entrega es un POST con el evento en el cuerpo y el header " +
        "`X-Colibly-Signature: t=<unix>,v1=<hex>`, donde v1 = HMAC-SHA256(secret, `${t}.${cuerpo}`). " +
        `Responde 2xx en menos de ${WEBHOOK_TIMEOUT_SECONDS} s; hay ${WEBHOOK_DELIVERY_ATTEMPTS} intentos con espera creciente.`,
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
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
    },
    "x-colibly-error-codes": API_ERROR_CODES,
    "x-colibly-events": WEBHOOK_EVENT_DOCS.map((e) => ({ ...e, example: exampleEvent(e.type, e.example) })),
    tags: [
      { name: "Cuenta", description: "Identidad de la key y cuentas a su alcance" },
      { name: "Contactos" },
      { name: "Conversaciones" },
      { name: "Mensajes" },
      { name: "Automatizaciones" },
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
            { name: "contactId", in: "query", schema: { type: "string" } },
          ],
          "x-example-query": "status=OPEN&limit=20",
          responses: { "200": ok(paged("Conversation"), { data: [EX.conversation], nextCursor: null }), ...errors },
        },
      },
      "/conversations/{id}": {
        get: { tags: ["Conversaciones"], summary: "Obtener conversación", description: scopeNote("conversations:read"), parameters: [idParam], responses: { "200": ok(ref("Conversation"), EX.conversation), ...errors } },
      },
      "/conversations/{id}/messages": {
        get: {
          tags: ["Conversaciones"],
          summary: "Mensajes de una conversación",
          description: `${scopeNote("conversations:read")} Recientes primero.`,
          parameters: [idParam, ...pageParams],
          responses: { "200": ok(paged("Message"), { data: [EX.message], nextCursor: null }), ...errors },
        },
      },
      "/messages": {
        post: {
          tags: ["Mensajes"],
          summary: "Enviar mensaje",
          description:
            `${scopeNote("messages:send")} Destino: \`conversationId\` o \`contactId\`. En WhatsApp, texto y botones solo dentro de la ventana de 24 h ` +
            "(fuera de ella: 422 window_closed → usa una plantilla aprobada). Una plantilla a un contacto sin chat abre el chat. " +
            "**Manda siempre `Idempotency-Key`**: si reintentas por un timeout, el mensaje no sale dos veces.",
          parameters: [idempotencyParam],
          requestBody: { required: true, content: json(ref("SendMessage"), { conversationId: "cmchat_01", type: "text", text: "Sí, enviamos a todo México." }) },
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
    },
    webhooks: {
      event: {
        post: {
          summary: "Evento entregado a tu URL",
          description: WEBHOOK_EVENT_DOCS.map((e) => `- \`${e.type}\`: ${e.description}`).join("\n"),
          parameters: [
            { name: "X-Colibly-Signature", in: "header", required: true, schema: { type: "string" }, description: "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${cuerpo}`)>" },
            { name: "X-Colibly-Event", in: "header", required: true, schema: { type: "string" } },
            { name: "X-Colibly-Delivery", in: "header", required: true, schema: { type: "string" }, description: "Id de la entrega; se repite en los reintentos" },
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
        RateLimitScope: {
          description: "Límite informado en X-RateLimit-*: el más ajustado, o el que rechazó en un 429",
          schema: { type: "string", enum: ["key", "organization", "ip", "endpoint", "daily"] },
        },
      },
      responses: {
        InvalidRequest: errorResponse("Solicitud inválida", "invalid_request", "phone debe tener entre 8 y 15 dígitos, con código de país"),
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
              properties: { code: { type: "string", enum: API_ERROR_CODES.map((e) => e.code) }, message: { type: "string", description: "En español, para mostrar o registrar; ramifica por `code`" } },
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
          properties: { id: str, channel: ref("Channel"), name: str, phoneNumber: { ...strNull, description: "Solo WhatsApp" }, status: str },
        },
        Contact: {
          type: "object",
          properties: {
            id: str,
            accountId: str,
            channel: ref("Channel"),
            name: strNull,
            realName: strNull,
            phone: { ...strNull, description: "Solo WhatsApp" },
            externalId: { ...strNull, description: "Id del contacto en Telegram/Messenger/Instagram/Web" },
            leadStatus: ref("LeadStatus"),
            leadOrigin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
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
            phone: { type: "string", description: "Con código de país, p. ej. 5215512345678 (8 a 15 dígitos)" },
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
            unreadCount: { type: "integer" },
            lastMessage: strNull,
            lastMessageAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
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
            status: { ...strNull, description: "Salientes: sent, delivered, read, failed" },
            senderId: { ...strNull, description: "Usuario que lo envió (salientes de agente)" },
            interactive: { description: "Botones o lista, si aplica" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        SendMessage: {
          type: "object",
          required: ["type"],
          description: "Envía conversationId o contactId (uno de los dos).",
          properties: {
            conversationId: str,
            contactId: str,
            type: { type: "string", enum: ["text", "buttons", "template"] },
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
            account: { type: ["object", "null"], properties: { id: str, channel: ref("Channel"), name: str } },
            contact: {
              type: ["object", "null"],
              properties: { id: str, name: strNull, phone: strNull, externalId: strNull, leadStatus: ref("LeadStatus"), leadOrigin: str },
              description: "Datos del momento de la entrega",
            },
            conversation: { type: ["object", "null"], properties: { id: str, channel: ref("Channel"), status: str, assignedToId: strNull } },
            data: { type: "object", description: "Depende del tipo; ver x-colibly-events" },
          },
        },
      },
    },
  };
}

export type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;
