import { API_SCOPES } from "./scopes";
import { OUTBOUND_MEDIA_RULES, OUTBOUND_MEDIA_TYPES } from "@/lib/messaging/outbound-media";
import { WEBHOOK_ROTATION_MAX_GRACE_HOURS } from "@/lib/webhooks/crud";
import { OUTBOUND_ORIGINS } from "@/lib/messages/origin";
import { DOMAIN_EVENT_CATALOG, type DomainEventType } from "@/lib/events/types";
import { BRAND_NAME } from "@/lib/brand";
import { API_SEND_TYPES } from "@/lib/api/schemas";
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

export const API_VERSION = "1.9.0";

// Cambios del contrato, del más nuevo al más viejo. Todos aditivos dentro de v1.
export const API_CHANGELOG: { version: string; schemaVersion: string; date: string; changes: string[] }[] = [
  {
    version: "1.9.0",
    schemaVersion: API_SCHEMA_VERSION,
    date: "2026-11-13",
    changes: [
      "Mensaje de bienvenida: `welcomeMessage` en PATCH /accounts/{id}/conversational-automation (y en la ficha de la cuenta). Quien abre el chat por primera vez deja un mensaje `type: \"request_welcome\"`, el evento nuevo `conversation.welcome_requested` y, si hay texto, recibe el saludo.",
      "Catálogo: tipos `product`, `product_list` y `catalog` en POST /messages; GET y PATCH /accounts/{id}/catalog (catálogos conectados, carrito y catálogo visible); evento `order.received` con productos y total.",
      "WhatsApp Flows: GET /accounts/{id}/flows, tipo `flow` en POST /messages, `content.flowResponse` en la respuesta del cliente y evento `flow.completed`.",
      "`interactive.style` admite `product`, `product_list`, `catalog` y `flow`, con `catalogId`, `flowId` y `flowToken`.",
    ],
  },
  {
    version: "1.8.0",
    schemaVersion: "2026-11-13.4",
    date: "2026-11-13",
    changes: [
      "GET /accounts/{id}/analytics: mensajes cobrables y su costo según Meta, por día o por mes, con país, categoría y tipo de precio (permiso `whatsapp:manage`).",
      "GET /templates/{id}/analytics: enviados, entregados, leídos y clics de una plantilla por día.",
      "GET y PATCH /accounts/{id}/conversational-automation: sugerencias de inicio y comandos \"/\" del número.",
      "Códigos QR con mensaje prellenado: GET y POST /accounts/{id}/qr-codes, PATCH y DELETE /accounts/{id}/qr-codes/{code}.",
      "Evento nuevo `contact.marketing_preference_changed`: el cliente pidió dejar de recibir marketing (o volver a recibirlo) con el botón de WhatsApp.",
    ],
  },
  {
    version: "1.7.1",
    schemaVersion: "2026-11-13.3",
    date: "2026-11-13",
    changes: [
      "Teléfonos de la API (`to` en POST /messages, `phone` en POST /contacts, bloqueos): 10 dígitos sin `+` se toman como un número de México (5512345678 → 525512345678). Antes se tomaban como un número sin código de país y no encontraban al contacto.",
      "`interactive.buttons[].description` en los mensajes de lista: la descripción de cada opción, si la tiene.",
    ],
  },
  {
    version: "1.7.0",
    schemaVersion: "2026-11-13.2",
    date: "2026-11-13",
    changes: [
      "Permiso nuevo `whatsapp:manage` para administrar la cuenta en Meta. Las keys existentes no lo tienen: se agrega editando la key en Configuración → API.",
      "GET /accounts/{id}: la cuenta con `health` (calidad del número, límite de envío, estado del nombre, si puede enviar y avisos de Meta).",
      "GET y PATCH /accounts/{id}/profile: el perfil de empresa de WhatsApp (descripción, dirección, correo, sitios, categoría y foto por URL).",
      "GET y POST /accounts/{id}/blocked-users, DELETE /accounts/{id}/blocked-users/{phone}: la lista de bloqueo del número.",
      "POST /templates (crear en Meta, con el ejemplo de cabecera multimedia por URL), GET /templates/{id} (con `components` de Meta) y DELETE /templates/{id}.",
      "Eventos nuevos sin contacto ni conversación: `template.status_changed`, `template.category_changed` y `account.quality_changed`.",
    ],
  },
  {
    version: "1.6.0",
    schemaVersion: "2026-11-13",
    date: "2026-11-13",
    changes: [
      "POST /messages acepta `accountId` + `to` (teléfono con código de país) como destino en WhatsApp, sin crear antes el contacto: si no existe se crea al enviar una plantilla (fuera de la ventana de 24 h solo sale una plantilla).",
      "Tipos nuevos en POST /messages: `list` (hasta 10 opciones, todos los canales con botones), y solo en WhatsApp `sticker` (WebP 512×512 por `media.url`), `location`, `location_request` (botón \"Enviar ubicación\") y `cta_url` (botón que abre una URL).",
      "`replyTo` en POST /messages cita un mensaje de la misma conversación (WhatsApp). El mensaje enviado trae `replyTo` como cualquier respuesta citada.",
      "Los mensajes salientes `cta_url` y `location_request` llegan con `type: \"interactive\"` e `interactive.style` = `cta_url` (con `interactive.url`) o `location_request`. Una `location` saliente trae `content.location` igual que una entrante.",
      "Nuevo: POST /messages/{id}/reaction (reaccionar o quitar la reacción, WhatsApp) y POST /conversations/{id}/read (marcar como leída; en WhatsApp también para el cliente y, con `typing: true`, mostrar \"escribiendo…\").",
    ],
  },
  {
    version: "1.5.0",
    schemaVersion: "2026-11-06.2",
    date: "2026-11-06",
    changes: [
      "Archivos que Meta no entrega: cuando un cliente manda un archivo de más de 100 MB, WhatsApp no lo pasa a la API. Antes no quedaba rastro; ahora hay un mensaje entrante con `type: \"media_too_large\"`, `text` con el aviso en español y `content: {kind, maxMb, sizeMb, onPhone}` (`onPhone: true` = se puede ver en la app de WhatsApp Business del teléfono conectado). También llega como `message.received`. No trae `media`. Quien filtre por `type` debe tolerar este valor nuevo.",
    ],
  },
  {
    version: "1.4.0",
    schemaVersion: "2026-11-06",
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
  commerce: { accountId: "cmacc_wa_01", catalogs: [{ id: "1234567890", name: "Catálogo Tienda Centro" }], cartEnabled: true, catalogVisible: true },
  qr: { code: "4O4YGZEG3RIVE1", prefilledMessage: "Hola, quiero información de la promoción", deepLinkUrl: "https://wa.me/message/4O4YGZEG3RIVE1", qrImageUrl: "https://scontent.whatsapp.net/v/qr-ejemplo.png" },
  profile: {
    accountId: "cmacc_wa_01",
    about: "Respondemos de 9 a 19 h",
    address: "Av. Reforma 100, CDMX",
    description: "Muebles a la medida con envío a todo México",
    email: "ventas@ejemplo.mx",
    websites: ["https://ejemplo.mx"],
    vertical: "RETAIL",
    profilePictureUrl: "https://pps.whatsapp.net/v/t61/ejemplo.jpg",
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
  "contact.marketing_preference_changed": {
    data: obj({
      optedOut: { type: "boolean", description: "true = pidió no recibir marketing (Contact.optedOutMarketing); false = volvió a aceptarlo" },
      source: { type: "string", enum: ["whatsapp"], description: "Botón nativo de WhatsApp" },
    }),
    example: { optedOut: true, source: "whatsapp" },
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
  "conversation.welcome_requested": {
    data: obj({ messageId: { ...str, description: "El aviso guardado en la conversación (type request_welcome)" } }),
    example: { messageId: "cmmsg_09" },
  },
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
  "flow.completed": {
    data: obj({
      messageId: str,
      flowToken: { ...strNull, description: "El flow.token del envío (o el que generó Colibly): crúzalo con tu sistema" },
      response: { type: "object", description: "Lo que llenó el cliente, con los nombres de campo del Flow" },
    }),
    example: { messageId: "cmmsg_11", flowToken: "cita-A-1043", response: { sucursal: "centro", fecha: "2026-11-20", hora: "10:00" } },
  },
  "order.received": {
    data: obj({
      messageId: str,
      catalogId: strNull,
      text: { ...strNull, description: "Nota que escribió el cliente con el pedido" },
      items: { type: "array", items: obj({ productId: { ...strNull, description: "product_retailer_id" }, quantity: { type: ["number", "null"] }, price: { type: ["number", "null"], description: "Precio unitario" }, currency: strNull }) },
      total: { type: ["number", "null"], description: "Suma de precio × cantidad; null si falta un dato o hay varias monedas" },
      currency: strNull,
    }),
    example: { messageId: "cmmsg_10", catalogId: "1234567890", text: "Para entrega el sábado", items: [{ productId: "SKU-1043", quantity: 2, price: 1499, currency: "MXN" }], total: 2998, currency: "MXN" },
  },
  "template.status_changed": {
    data: obj({
      templateId: { ...str, description: "id de GET /templates/{id}" },
      name: str,
      language: str,
      event: { ...str, description: "El suceso de Meta: APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED (en riesgo, sigue activa), REINSTATED, IN_APPEAL…" },
      status: { ...str, description: "Estado de la plantilla después del evento" },
      previousStatus: str,
      reason: { ...strNull, description: "Motivo en español (rechazo, pausa o aviso de calidad)" },
    }),
    example: { templateId: "cmtpl_01", name: "confirmacion_pedido", language: "es_MX", event: "APPROVED", status: "APPROVED", previousStatus: "PENDING", reason: null },
  },
  "template.category_changed": {
    data: obj({ templateId: str, name: str, language: str, category: { ...str, description: "MARKETING, UTILITY o AUTHENTICATION" }, previousCategory: str }),
    example: { templateId: "cmtpl_01", name: "confirmacion_pedido", language: "es_MX", category: "MARKETING", previousCategory: "UTILITY" },
  },
  "account.quality_changed": {
    data: obj({
      event: { ...strNull, description: "El suceso de Meta: FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE, ONBOARDING…" },
      messagingTier: { ...strNull, description: "Límite de envío vigente si Meta lo informa (TIER_250, TIER_1K…). La calidad actual: GET /accounts/{id}" },
    }),
    example: { event: "UPGRADE", messagingTier: "TIER_10K" },
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
  // Eventos de la cuenta: sin contacto ni conversación.
  const accountOnly = type.startsWith("template.") || type.startsWith("account.");
  const noConversation = type === "contact.created" || type === "contact.marketing_preference_changed";
  return {
    id: "7d1f2c9e-3b4a-4f0e-9a51-0c2b8e6d4f10",
    type,
    occurredAt: "2026-10-18T19:02:11.000Z",
    account: test ? null : { id: EX.account.id, channel: "WHATSAPP", name: EX.account.name, phoneNumber: EX.account.phoneNumber, phoneE164: EX.account.phoneE164 },
    contact: test || accountOnly
      ? null
      : { id: EX.contact.id, name: EX.contact.name, realName: null, tags: EX.contact.tags, phone: EX.contact.phone, phoneE164: EX.contact.phoneE164, externalId: null, leadStatus: EX.contact.leadStatus, leadOrigin: "ORGANIC" },
    conversation: test || accountOnly || noConversation ? null : { id: EX.conversation.id, channel: "WHATSAPP", status: "OPEN", assignedToId: "cmusr_02" },
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
      { name: "WhatsApp", description: "Administración de la cuenta en Meta: estado del número, perfil de empresa, bloqueos y plantillas" },
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
      "/accounts/{id}": {
        get: {
          tags: ["WhatsApp"],
          summary: "Cuenta y estado del número",
          description:
            "Sin permiso especial. En WhatsApp trae `health`: calidad del número (`qualityRating`), límite de envío (`messagingTier`), estado del nombre para mostrar, si puede enviar (`canSendMessage`) y los avisos de Meta en español. " +
            "Se vuelve a leer de Meta como mucho cada 10 minutos (`health.checkedAt`). Otros canales: `health: null`.",
          parameters: [idParam],
          responses: {
            "200": ok(ref("AccountDetail"), {
              ...EX.account, wabaId: "102290129340398", phoneNumberId: "106540352242922", coexistence: false,
              health: { qualityRating: "GREEN", lastQualityEvent: "UPGRADE", messagingTier: "TIER_10K", nameStatus: "APPROVED", canSendMessage: "AVAILABLE", notices: [], checkedAt: "2026-11-13T17:00:00.000Z" },
              createdAt: "2026-10-01T16:00:00.000Z",
            }),
            ...errors,
          },
        },
      },
      "/accounts/{id}/profile": {
        get: {
          tags: ["WhatsApp"],
          summary: "Perfil de empresa",
          description: "Sin permiso especial. El perfil que ven los clientes en WhatsApp, leído de Meta al momento. 422 si la cuenta no está conectada a WhatsApp Cloud API.",
          parameters: [idParam],
          responses: { "200": ok(ref("BusinessProfile"), EX.profile), "502": err("UpstreamError"), ...errors },
        },
        patch: {
          tags: ["WhatsApp"],
          summary: "Editar el perfil de empresa",
          description:
            `${scopeNote("whatsapp:manage")} Solo cambia los campos enviados; \`""\` borra uno (salvo \`about\`). \`profilePictureUrl\`: JPG o PNG de hasta 5 MB por https; Colibly lo sube a Meta (la cuenta necesita App ID). ` +
            "Responde el perfil ya actualizado; la foto nueva puede tardar unos segundos en aparecer en `profilePictureUrl`. Límite: 30 cambios por minuto por organización entre perfil, bloqueos y plantillas.",
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("BusinessProfileUpdate"), { about: "Respondemos de 9 a 19 h", websites: ["https://ejemplo.mx"] }) },
          responses: { "200": ok(ref("BusinessProfile"), EX.profile), "502": err("UpstreamError"), ...writeErrors },
        },
      },
      "/accounts/{id}/blocked-users": {
        get: {
          tags: ["WhatsApp"],
          summary: "Usuarios bloqueados",
          description: `${scopeNote("whatsapp:manage")} La lista de bloqueo del número, leída de Meta. \`nextCursor\` es el de Meta: pásalo en \`cursor\`.`,
          parameters: [idParam, ...pageParams],
          responses: {
            "200": ok({ type: "object", properties: { data: { type: "array", items: obj({ phone: str }) }, nextCursor: strNull } }, { data: [{ phone: "5215512345678" }], nextCursor: null }),
            "502": err("UpstreamError"),
            ...errors,
          },
        },
        post: {
          tags: ["WhatsApp"],
          summary: "Bloquear usuarios",
          description:
            `${scopeNote("whatsapp:manage")} Un bloqueado no puede escribir al número ni recibir mensajes de él. Regla de Meta: solo a quien escribió en las últimas 24 h. ` +
            "Hasta 100 teléfonos por llamada; responde 200 con el resultado de cada uno (`blocked` y `failed`).",
          parameters: [idParam],
          requestBody: { required: true, content: json({ type: "object", required: ["phones"], additionalProperties: false, properties: { phones: { type: "array", minItems: 1, maxItems: 100, items: str, description: "Con código de país; 10 dígitos = México" } } }, { phones: ["+5215512345678"] }) },
          responses: {
            "200": ok(
              { type: "object", properties: { blocked: { type: "array", items: obj({ phone: str }) }, failed: { type: "array", items: obj({ phone: str, error: str }) } } },
              { blocked: [{ phone: "5215512345678" }], failed: [] }
            ),
            "502": err("UpstreamError"),
            ...writeErrors,
          },
        },
      },
      "/accounts/{id}/blocked-users/{phone}": {
        delete: {
          tags: ["WhatsApp"],
          summary: "Desbloquear un usuario",
          description: `${scopeNote("whatsapp:manage")}`,
          parameters: [idParam, { name: "phone", in: "path", required: true, schema: str, description: "Con código de país; 10 dígitos = México" }],
          responses: { "200": ok(obj({ phone: str, blocked: { type: "boolean" } }), { phone: "5215512345678", blocked: false }), "502": err("UpstreamError"), ...writeErrors },
        },
      },
      "/accounts/{id}/analytics": {
        get: {
          tags: ["WhatsApp"],
          summary: "Costos y volumen de mensajes",
          description:
            `${scopeNote("whatsapp:manage")} Mensajes cobrables y su costo según Meta (modelo por mensaje) del número de la cuenta, por día o por mes, desglosados por país, categoría (MARKETING, UTILITY, AUTHENTICATION, SERVICE) y tipo de precio (REGULAR, FREE_CUSTOMER_SERVICE, FREE_ENTRY_POINT…). ` +
            "El costo está en la moneda de la cuenta de WhatsApp Business en Meta. Por omisión, los últimos 30 días; máximo 365.",
          parameters: [
            idParam,
            { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "granularity", in: "query", schema: { type: "string", enum: ["DAILY", "MONTHLY"], default: "DAILY" } },
          ],
          responses: {
            "200": ok(
              obj({
                accountId: str,
                since: { type: "string", format: "date-time" },
                until: { type: "string", format: "date-time" },
                granularity: str,
                totals: obj({ volume: { type: "integer" }, cost: { type: "number" } }),
                data: { type: "array", items: obj({ start: str, end: str, phone: strNull, country: strNull, category: strNull, pricingType: strNull, volume: { type: "integer" }, cost: { type: "number" } }) },
              }),
              {
                accountId: "cmacc_wa_01", since: "2026-10-14T00:00:00.000Z", until: "2026-11-13T00:00:00.000Z", granularity: "DAILY",
                totals: { volume: 120, cost: 61.2 },
                data: [{ start: "2026-11-12T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", phone: "525512345678", country: "MX", category: "MARKETING", pricingType: "REGULAR", volume: 120, cost: 61.2 }],
              }
            ),
            "502": err("UpstreamError"),
            ...errors,
          },
        },
      },
      "/accounts/{id}/conversational-automation": {
        get: {
          tags: ["WhatsApp"],
          summary: "Sugerencias de inicio y comandos",
          description: "Sin permiso especial. `prompts` son los botones que ve el cliente al abrir el chat; `commands`, lo que aparece al escribir \"/\". Al tocarlos, el cliente manda ese texto como un mensaje normal. `welcomeMessageEnabled` (Meta) y `welcomeMessageText` (Colibly): el saludo a quien abre el chat por primera vez.",
          parameters: [idParam],
          responses: {
            "200": ok(
              ref("ConversationalAutomation"),
              { accountId: "cmacc_wa_01", welcomeMessageEnabled: true, welcomeMessageText: "¡Hola! Gracias por escribirnos. ¿En qué te ayudamos?", prompts: ["Quiero una cotización", "¿Dónde están?"], commands: [{ name: "horarios", description: "Horario de atención" }] }
            ),
            "502": err("UpstreamError"),
            ...errors,
          },
        },
        patch: {
          tags: ["WhatsApp"],
          summary: "Cambiar sugerencias y comandos",
          description:
            `${scopeNote("whatsapp:manage")} Solo cambia lo enviado; \`[]\` borra la lista. Hasta 4 sugerencias de 80 caracteres y 30 comandos (nombre de 32, sin "/" ni espacios; descripción de 256). WhatsApp puede tardar en mostrarlos. ` +
            "`welcomeMessage`: con `enabled: true` WhatsApp avisa cuando alguien abre el chat por primera vez sin escribir; Colibly guarda un aviso (`type: \"request_welcome\"`), emite `conversation.welcome_requested` y, si hay `text`, lo contesta (una vez, y nunca si alguien ya le escribió). Sin `text`, el saludo queda en tus manos con el evento. `text: null` lo borra.",
          parameters: [idParam],
          requestBody: {
            required: true,
            content: json(
              {
                type: "object",
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  prompts: { type: "array", maxItems: 4, items: str },
                  commands: { type: "array", maxItems: 30, items: obj({ name: str, description: str }) },
                  welcomeMessage: { type: "object", required: ["enabled"], additionalProperties: false, properties: { enabled: { type: "boolean" }, text: { type: ["string", "null"], maxLength: 1024 } } },
                },
              },
              { prompts: ["Quiero una cotización", "¿Dónde están?"], welcomeMessage: { enabled: true, text: "¡Hola! Gracias por escribirnos. ¿En qué te ayudamos?" } }
            ),
          },
          responses: {
            "200": ok(
              ref("ConversationalAutomation"),
              { accountId: "cmacc_wa_01", welcomeMessageEnabled: true, welcomeMessageText: "¡Hola! Gracias por escribirnos. ¿En qué te ayudamos?", prompts: ["Quiero una cotización", "¿Dónde están?"], commands: [{ name: "horarios", description: "Horario de atención" }] }
            ),
            "502": err("UpstreamError"),
            ...writeErrors,
          },
        },
      },
      "/accounts/{id}/flows": {
        get: {
          tags: ["WhatsApp"],
          summary: "WhatsApp Flows",
          description:
            `${scopeNote("messages:send")} Los Flows (formularios dentro de WhatsApp) de la cuenta. Se diseñan y publican en el constructor de Flows del Administrador de WhatsApp; ` +
            "se mandan con POST /messages `type: \"flow\"`: los PUBLISHED, o un DRAFT con `flow.draft: true` para probarlo.",
          parameters: [idParam],
          responses: {
            "200": ok(
              { type: "object", properties: { data: { type: "array", items: obj({ id: str, name: str, status: { type: "string", description: "DRAFT, PUBLISHED, DEPRECATED, BLOCKED, THROTTLED" }, categories: { type: "array", items: str } }) } } },
              { data: [{ id: "1234567890123456", name: "Agendar visita", status: "PUBLISHED", categories: ["APPOINTMENT_BOOKING"] }] }
            ),
            "502": err("UpstreamError"),
            ...errors,
          },
        },
      },
      "/accounts/{id}/catalog": {
        get: {
          tags: ["WhatsApp"],
          summary: "Catálogo y ajustes de comercio",
          description:
            "Sin permiso especial. `catalogs`: los catálogos de Meta conectados a la cuenta (se conectan en el Administrador de WhatsApp; con uno solo, los envíos `product` y `product_list` no necesitan `catalogId`). " +
            "`cartEnabled`: el cliente puede armar un pedido en el chat (llega como mensaje `order` y evento `order.received`). `catalogVisible`: el botón de tienda aparece en el perfil y el chat.",
          parameters: [idParam],
          responses: { "200": ok(ref("CommerceSettings"), EX.commerce), "502": err("UpstreamError"), ...errors },
        },
        patch: {
          tags: ["WhatsApp"],
          summary: "Cambiar los ajustes de comercio",
          description: `${scopeNote("whatsapp:manage")} Activa o apaga el carrito y la visibilidad del catálogo.`,
          parameters: [idParam],
          requestBody: { required: true, content: json({ type: "object", additionalProperties: false, minProperties: 1, properties: { cartEnabled: { type: "boolean" }, catalogVisible: { type: "boolean" } } }, { cartEnabled: true, catalogVisible: true }) },
          responses: { "200": ok(ref("CommerceSettings"), EX.commerce), "502": err("UpstreamError"), ...writeErrors },
        },
      },
      "/accounts/{id}/qr-codes": {
        get: {
          tags: ["WhatsApp"],
          summary: "Códigos QR",
          description: "Sin permiso especial. Códigos QR y enlaces (`deepLinkUrl`) que abren el chat con un mensaje ya escrito.",
          parameters: [idParam],
          responses: { "200": ok({ type: "object", properties: { data: { type: "array", items: ref("QrCode") } } }, { data: [EX.qr] }), "502": err("UpstreamError"), ...errors },
        },
        post: {
          tags: ["WhatsApp"],
          summary: "Crear un código QR",
          description: `${scopeNote("whatsapp:manage")} \`prefilledMessage\` hasta 140 caracteres; \`format\` de la imagen PNG (por omisión) o SVG. \`qrImageUrl\` es temporal: descárgala si la vas a imprimir.`,
          parameters: [idParam],
          requestBody: { required: true, content: json({ type: "object", required: ["prefilledMessage"], additionalProperties: false, properties: { prefilledMessage: str, format: { type: "string", enum: ["PNG", "SVG"] } } }, { prefilledMessage: "Hola, quiero información de la promoción" }) },
          responses: { "201": ok(ref("QrCode"), EX.qr, "Creado"), "502": err("UpstreamError"), ...writeErrors },
        },
      },
      "/accounts/{id}/qr-codes/{code}": {
        patch: {
          tags: ["WhatsApp"],
          summary: "Cambiar el mensaje de un código QR",
          description: `${scopeNote("whatsapp:manage")} El QR y el enlace siguen siendo los mismos.`,
          parameters: [idParam, { name: "code", in: "path", required: true, schema: str }],
          requestBody: { required: true, content: json({ type: "object", required: ["prefilledMessage"], additionalProperties: false, properties: { prefilledMessage: str } }, { prefilledMessage: "Hola, quiero agendar una cita" }) },
          responses: { "200": ok(ref("QrCode"), EX.qr), "502": err("UpstreamError"), ...writeErrors },
        },
        delete: {
          tags: ["WhatsApp"],
          summary: "Borrar un código QR",
          description: `${scopeNote("whatsapp:manage")} El QR impreso y su enlace dejan de funcionar.`,
          parameters: [idParam, { name: "code", in: "path", required: true, schema: str }],
          responses: { "200": ok(obj({ code: str, deleted: { type: "boolean" } }), { code: "4O4YGZEG3RIVE1", deleted: true }), "502": err("UpstreamError"), ...writeErrors },
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
      "/conversations/{id}/read": {
        post: {
          tags: ["Conversaciones"],
          summary: "Marcar como leída (y mostrar \"escribiendo…\")",
          description:
            `${scopeNote("conversations:write")} Pone \`unreadCount\` en 0. En WhatsApp también marca como leído el último mensaje del cliente (palomitas azules; Meta marca los anteriores) y, con \`typing: true\`, ` +
            "le muestra \"escribiendo…\" hasta 25 s o hasta tu respuesta: úsalo justo antes de una respuesta que tarda (p. ej. de una IA). En otros canales solo se marca en Colibly y `typing` se ignora. " +
            "`readOnWhatsApp: false` si la conversación aún no tiene un mensaje del cliente con id de WhatsApp.",
          parameters: [idParam],
          requestBody: { required: false, content: json({ type: "object", additionalProperties: false, properties: { typing: { type: "boolean", description: "Mostrar \"escribiendo…\" (WhatsApp)" } } }, { typing: true }) },
          responses: {
            "200": ok(
              { type: "object", properties: { conversationId: str, read: { type: "boolean" }, typing: { type: "boolean", description: "true si WhatsApp recibió el indicador" }, readOnWhatsApp: { type: "boolean" } } },
              { conversationId: "cmchat_01", read: true, typing: true, readOnWhatsApp: true }
            ),
            "502": err("UpstreamError"),
            ...writeErrors,
          },
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
      "/messages/{id}/reaction": {
        post: {
          tags: ["Mensajes"],
          summary: "Reaccionar a un mensaje",
          description:
            `${scopeNote("messages:send")} Solo WhatsApp. Reacciona con un emoji a un mensaje entrante o saliente de los últimos 30 días; \`emoji: ""\` quita la reacción. ` +
            "Una reacción nueva reemplaza a la anterior. Cuenta para el límite por minuto de envíos, no para el cupo diario. 409 si otra reacción a ese mensaje sigue en curso.",
          parameters: [idParam, idempotencyParam],
          requestBody: { required: true, content: json({ type: "object", required: ["emoji"], additionalProperties: false, properties: { emoji: { type: "string", description: "Un solo emoji, o \"\" para quitarla" } } }, { emoji: "👍" }) },
          responses: {
            "201": ok({ type: "object", properties: { messageId: str, emoji: str, status: { type: "string", description: "accepted = WhatsApp la recibió" } } }, { messageId: "cmmsg_01", emoji: "👍", status: "accepted" }, "Enviada"),
            "502": err("UpstreamError"),
            ...writeErrors,
          },
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
            `${scopeNote("messages:send")} Destino (uno): \`conversationId\`, \`contactId\` o \`accountId\` + \`to\` (WhatsApp: el teléfono con código de país; si el contacto no existe se crea, solo con una plantilla). ` +
            "En WhatsApp todo salvo las plantillas va solo dentro de la ventana de 24 h (fuera de ella: 422 window_closed → usa una plantilla aprobada). Una plantilla a un contacto sin chat abre el chat. " +
            "**Tipos:** `text`, `buttons` (hasta 3), `list` (hasta 10 opciones), `template`, archivos (abajo) y, solo en WhatsApp, `sticker` (WebP 512×512 por `media.url`), `location`, `location_request` (botón \"Enviar ubicación\"; la respuesta llega como mensaje entrante `location`), `cta_url` (botón que abre una URL) `flow` (abre un WhatsApp Flow: formulario dentro del chat) y del catálogo de Meta `product` (un producto), `product_list` (hasta 30 productos en 10 secciones) y `catalog` (botón \"Ver catálogo\"). " +
            "Sin `catalogId` se usa el único catálogo conectado a la cuenta (GET /accounts/{id}/catalog); los productos se identifican por su `product_retailer_id` (\"ID de contenido\" en Commerce Manager). Un pedido del carrito llega como mensaje `order` y como evento `order.received`. " +
            "**Flows:** `flow.id` de GET /accounts/{id}/flows, `flow.cta` (texto del botón) y `flow.screen` (primera pantalla; sin ella el Flow pide datos a su endpoint). La respuesta del cliente llega como mensaje con `content.flowResponse` y como evento `flow.completed`, con el `flow.token` que mandaste. " +
            "La opción que elige el cliente en `buttons` o `list` llega en `message.received` con `interactive.reply.id`. " +
            "**`replyTo`** (WhatsApp): id de un mensaje de la misma conversación para citarlo. " +
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
                  plantillaPorTelefono: { summary: "Plantilla a un teléfono", value: { accountId: "cmacc_01", to: "+5215512345678", type: "template", template: { id: "cmtpl_01", bodyParams: ["Ana", "A-1043"] } } },
                  lista: {
                    summary: "Lista",
                    value: { conversationId: "cmchat_01", type: "list", text: "¿Qué sucursal te queda mejor?", list: { button: "Ver sucursales", rows: [{ id: "cdmx", title: "CDMX Centro", description: "Lun a sáb, 9 a 19 h" }, { id: "gdl", title: "Guadalajara" }] } },
                  },
                  botonUrl: { summary: "Botón con URL", value: { conversationId: "cmchat_01", type: "cta_url", text: "Tu pedido A-1043 va en camino.", cta: { label: "Rastrear", url: "https://tienda.ejemplo.mx/pedidos/A-1043" } } },
                  ubicacion: { summary: "Ubicación", value: { conversationId: "cmchat_01", type: "location", location: { latitude: 19.4326, longitude: -99.1332, name: "Sucursal Centro", address: "Av. Juárez 10, CDMX" } } },
                  pedirUbicacion: { summary: "Pedir ubicación", value: { conversationId: "cmchat_01", type: "location_request", text: "¿Nos compartes tu ubicación para calcular el envío?" } },
                  producto: { summary: "Un producto del catálogo", value: { conversationId: "cmchat_01", type: "product", text: "Este es el modelo que buscabas", product: { id: "SKU-1043" } } },
                  listaProductos: {
                    summary: "Lista de productos",
                    value: { conversationId: "cmchat_01", type: "product_list", text: "Lo más vendido de la semana", productList: { header: "Ofertas", sections: [{ title: "Sillas", productIds: ["SKU-1043", "SKU-1044"] }, { title: "Mesas", productIds: ["SKU-2001"] }] } },
                  },
                  flow: {
                    summary: "WhatsApp Flow",
                    value: { conversationId: "cmchat_01", type: "flow", text: "Agenda tu visita en un minuto", flow: { id: "1234567890123456", cta: "Agendar", screen: "CITA", token: "cita-A-1043" } },
                  },
                  catalogo: { summary: "Botón \"Ver catálogo\"", value: { conversationId: "cmchat_01", type: "catalog", text: "Mira todo nuestro catálogo", catalog: { thumbnailProductId: "SKU-1043" } } },
                  citando: { summary: "Respuesta citando un mensaje", value: { conversationId: "cmchat_01", type: "text", text: "Sí, ese modelo tiene garantía de 1 año.", replyTo: "cmmsg_01" } },
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
        post: {
          tags: ["WhatsApp"],
          summary: "Crear una plantilla",
          description:
            `${scopeNote("whatsapp:manage")} La manda a revisión de Meta y responde la plantilla en \`PENDING\`, con \`components\` en el formato de Meta. El resultado llega con el evento \`template.status_changed\` (o GET /templates/{id}). ` +
            "Categorías MARKETING o UTILITY. Variables del cuerpo `{{1}}`, `{{2}}`… seguidas, con un ejemplo cada una en `bodyExamples`. Cabecera TEXT (60 caracteres, una variable `{{1}}` con `exampleText`) o IMAGE, VIDEO o DOCUMENT con `exampleUrl` (JPG/PNG, MP4 o PDF por https; la cuenta necesita App ID). " +
            "Hasta 10 botones QUICK_REPLY o URL (una URL puede terminar en `{{1}}`, con `urlExample`). 409 si ya existe ese nombre en ese idioma.",
          parameters: [idempotencyParam],
          requestBody: {
            required: true,
            content: json(ref("TemplateCreate"), {
              accountId: "cmacc_wa_01",
              name: "confirmacion_pedido",
              language: "es_MX",
              category: "UTILITY",
              components: { body: "Hola {{1}}, tu pedido {{2}} va en camino.", bodyExamples: ["Ana", "A-1043"], buttons: [{ type: "URL", text: "Rastrear", url: "https://ejemplo.mx/envio/{{1}}", urlExample: "https://ejemplo.mx/envio/A-1043" }] },
            }),
          },
          responses: { "201": ok(ref("TemplateDetail"), { ...EX.template, status: "PENDING" }, "Enviada a revisión"), "502": err("UpstreamError"), ...writeErrors },
        },
      },
      "/templates/{id}/analytics": {
        get: {
          tags: ["Catálogos"],
          summary: "Métricas de una plantilla",
          description: `${scopeNote("messages:send")} Enviados, entregados, leídos y clics por día según Meta, con \`totals\`. Por omisión, los últimos 30 días; Meta conserva hasta 90.`,
          parameters: [idParam, { name: "since", in: "query", schema: { type: "string", format: "date-time" } }, { name: "until", in: "query", schema: { type: "string", format: "date-time" } }],
          responses: {
            "200": ok(
              obj({ templateId: str, since: str, until: str, totals: obj({ sent: { type: "integer" }, delivered: { type: "integer" }, read: { type: "integer" }, clicked: { type: "integer" } }), data: { type: "array", items: obj({ date: str, sent: { type: "integer" }, delivered: { type: "integer" }, read: { type: "integer" }, clicked: { type: "integer" } }) } }),
              { templateId: "cmtpl_01", since: "2026-10-14T00:00:00.000Z", until: "2026-11-13T00:00:00.000Z", totals: { sent: 40, delivered: 38, read: 30, clicked: 6 }, data: [{ date: "2026-11-12T00:00:00.000Z", sent: 40, delivered: 38, read: 30, clicked: 6 }] }
            ),
            "502": err("UpstreamError"),
            ...errors,
          },
        },
      },
      "/templates/{id}": {
        get: {
          tags: ["Catálogos"],
          summary: "Obtener una plantilla",
          description: `${scopeNote("messages:send")} Igual que en GET /templates, más \`components\` tal como los guarda Meta (HEADER, BODY, FOOTER, BUTTONS).`,
          parameters: [idParam],
          responses: { "200": ok(ref("TemplateDetail"), EX.template), ...errors },
        },
        delete: {
          tags: ["WhatsApp"],
          summary: "Borrar una plantilla",
          description:
            `${scopeNote("whatsapp:manage")} La borra en Meta (solo ese idioma) y queda como DELETED en Colibly; las campañas que la usaron conservan su historial. Meta no deja volver a usar el nombre durante 30 días.`,
          parameters: [idParam],
          responses: { "200": ok(obj({ id: str, deleted: { type: "boolean" } }), { id: "cmtpl_01", deleted: true }), "502": err("UpstreamError"), ...writeErrors },
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
        AccountDetail: {
          type: "object",
          properties: {
            id: str,
            channel: ref("Channel"),
            name: str,
            phoneNumber: strNull,
            phoneE164: strNull,
            status: str,
            wabaId: { ...strNull, description: "Id de la cuenta de WhatsApp Business en Meta" },
            phoneNumberId: { ...strNull, description: "Id del número en Meta" },
            coexistence: { type: "boolean", description: "El número también se usa en la app WhatsApp Business del teléfono" },
            health: {
              type: ["object", "null"],
              description: "Solo WhatsApp",
              properties: {
                qualityRating: { ...strNull, description: "GREEN, YELLOW, RED o UNKNOWN" },
                lastQualityEvent: { ...strNull, description: "Último suceso de calidad de Meta: FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…" },
                messagingTier: { ...strNull, description: "Límite de conversaciones iniciadas por día: TIER_250, TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED" },
                nameStatus: { ...strNull, description: "Estado del nombre para mostrar: APPROVED, PENDING_REVIEW, DECLINED…" },
                canSendMessage: { ...strNull, description: "AVAILABLE, LIMITED o BLOCKED" },
                notices: { type: "array", items: str, description: "Avisos de Meta en español (qué limita el envío y cómo resolverlo)" },
                checkedAt: { type: ["string", "null"], format: "date-time" },
              },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        BusinessProfile: {
          type: "object",
          properties: {
            accountId: str,
            about: { ...strNull, description: "Texto \"Info\" (hasta 139 caracteres)" },
            address: strNull,
            description: strNull,
            email: strNull,
            websites: { type: "array", items: str },
            vertical: { ...strNull, description: "Categoría de Meta (RETAIL, RESTAURANT, PROF_SERVICES…)" },
            profilePictureUrl: { ...strNull, description: "URL temporal de Meta" },
          },
        },
        BusinessProfileUpdate: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            about: { type: "string", minLength: 1, maxLength: 139 },
            address: { type: "string", maxLength: 256 },
            description: { type: "string", maxLength: 512 },
            email: { type: "string", maxLength: 128, description: "\"\" lo borra" },
            websites: { type: "array", maxItems: 2, items: { type: "string", maxLength: 256 } },
            vertical: { type: "string", description: "Categoría de Meta en mayúsculas" },
            profilePictureUrl: { type: "string", description: "JPG o PNG de hasta 5 MB por https" },
          },
        },
        TemplateCreate: {
          type: "object",
          required: ["accountId", "name", "components"],
          additionalProperties: false,
          properties: {
            accountId: str,
            name: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 512 },
            language: { type: "string", default: "es", description: "Código de Meta: es, es_MX, en_US…" },
            category: { type: "string", enum: ["MARKETING", "UTILITY"], default: "MARKETING" },
            components: {
              type: "object",
              required: ["body"],
              additionalProperties: false,
              properties: {
                header: {
                  type: "object",
                  required: ["format"],
                  properties: {
                    format: { type: "string", enum: ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] },
                    text: { type: "string", maxLength: 60 },
                    exampleText: { type: "string", maxLength: 60, description: "Si text lleva {{1}}" },
                    exampleUrl: { type: "string", description: "IMAGE/VIDEO/DOCUMENT: archivo de ejemplo por https" },
                  },
                },
                body: { type: "string", maxLength: 1024 },
                bodyExamples: { type: "array", items: str, description: "Un valor por variable del cuerpo" },
                footer: { type: "string", maxLength: 60 },
                buttons: {
                  type: "array",
                  maxItems: 10,
                  items: {
                    type: "object",
                    required: ["type", "text"],
                    properties: {
                      type: { type: "string", enum: ["QUICK_REPLY", "URL"] },
                      text: { type: "string", maxLength: 25 },
                      url: { type: "string", description: "URL; puede terminar en {{1}}" },
                      urlExample: { type: "string", description: "La URL con la variable resuelta" },
                    },
                  },
                },
              },
            },
          },
        },
        ConversationalAutomation: {
          type: "object",
          properties: {
            accountId: str,
            welcomeMessageEnabled: { type: "boolean", description: "Activo en Meta" },
            welcomeMessageText: { ...strNull, description: "Lo que contesta Colibly; null = solo aviso y evento" },
            prompts: { type: "array", items: str },
            commands: { type: "array", items: obj({ name: str, description: str }) },
          },
        },
        CommerceSettings: {
          type: "object",
          properties: {
            accountId: str,
            catalogs: { type: "array", items: obj({ id: str, name: strNull }) },
            cartEnabled: { type: "boolean" },
            catalogVisible: { type: "boolean" },
          },
        },
        QrCode: {
          type: "object",
          properties: {
            code: str,
            prefilledMessage: str,
            deepLinkUrl: { ...strNull, description: "Enlace wa.me/message/… que abre el chat con el mensaje" },
            qrImageUrl: { ...strNull, description: "Imagen del QR (URL temporal de Meta)" },
          },
        },
        TemplateDetail: {
          allOf: [ref("Template"), { type: "object", properties: { components: { type: "array", items: { type: "object" }, description: "Componentes tal como los guarda Meta" } } }],
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
            phone: { type: "string", description: "Con código de país, p. ej. 5215512345678 o +52 55 1234 5678 (8 a 15 dígitos); 10 dígitos sin `+` se toman como México. En México 52… y 521… son el mismo contacto" },
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
            type: { type: "string", description: "text, image, video, audio, document, sticker, location, contacts, interactive, template, order, system… y `media_too_large`: aviso de un archivo del cliente de más de 100 MB que Meta no entrega (su `text` explica y `content` trae {kind, maxMb, sizeMb, onPhone}; no tiene `media`); `request_welcome`: el cliente abrió el chat por primera vez sin escribir (mensaje de bienvenida)" },
            text: strNull,
            caption: strNull,
            mimeType: strNull,
            filename: strNull,
            status: { ...strNull, description: "Salientes: sent, delivered, read, failed (null en salientes antiguos de la app WhatsApp Business y en entrantes)" },
            senderId: { ...strNull, description: "Usuario de Colibly que lo mandó o lo disparó" },
            interactive: {
              type: ["object", "null"],
              description: "Botones o lista que mandó el negocio, si aplica",
              properties: {
                buttons: { type: "array", items: { type: "object", properties: { id: str, title: str, description: { type: "string", description: "Solo filas de una lista que la tienen" } } } },
                style: { type: "string", enum: ["list", "cta_url", "location_request", "product", "product_list", "catalog", "flow"], description: "Ausente = botones de respuesta. product/product_list: `buttons` son los productos (id = product_retailer_id; en una lista, `description` es la sección)" },
                catalogId: { type: "string", description: "product/product_list: catálogo de Meta" },
                flowId: { type: "string", description: "flow: el Flow enviado" },
                flowToken: { type: "string", description: "flow: el token que volverá en flow.completed" },
                buttonLabel: { type: "string", description: "list: texto del botón que abre la lista" },
                url: { type: "string", description: "cta_url: a dónde lleva el botón" },
              },
            },
            timestamp: { type: "string", format: "date-time" },
            externalId: { ...strNull, description: "Id del mensaje en el canal (wamid en WhatsApp)" },
            content: {
              type: ["object", "null"],
              description: "Lo que no cabe en text/caption/media. Según el tipo: location {latitude, longitude, name, address, url}; flowResponse {flowToken, data} en la respuesta a un Flow; contacts [{name, phones[{phone, waId, type}], emails, company}]; order {catalogId, text, items[{productId, quantity, price, currency}]}; system {type, body, newWaId}; errors [{code, title, detail}]; media {sha256, voice, animated}; forwarded; frequentlyForwarded; referredProduct; replyToFrom; placeholder {reason: \"history_media\"} en un media_placeholder del historial (el medio llega después al mismo mensaje)",
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
          description: "Destino: conversationId, contactId, o accountId + to (solo uno).",
          properties: {
            conversationId: str,
            contactId: str,
            accountId: { type: "string", description: "Cuenta de WhatsApp que envía (con `to`)" },
            to: { type: "string", description: "Teléfono con código de país (con `accountId`); se toman solo los dígitos; 10 dígitos sin `+` se toman como México (+52)" },
            type: { type: "string", enum: [...API_SEND_TYPES] },
            text: { type: "string", maxLength: 4096, description: "Requerido para text, buttons, list, cta_url y location_request" },
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
              description: "Requerido para image, document, audio, video y sticker. Colibly descarga la URL al enviar (sin redirecciones, 30 s como máximo). Un sticker es WebP de 512×512, hasta 100 KB (500 KB animado).",
              properties: {
                url: { type: "string", format: "uri", description: "https pública del archivo" },
                filename: { type: "string", maxLength: 200, description: "Nombre que verá el cliente (documentos). Por defecto, el de la URL" },
                mimeType: { type: "string", description: "Tipo del archivo si tu servidor no lo informa bien (p. ej. responde application/octet-stream)" },
              },
            },
            caption: { type: "string", maxLength: 1024, description: "Texto junto al archivo (image, video, document). No en audio, ni en Messenger/Instagram" },
            list: {
              type: "object",
              required: ["button", "rows"],
              additionalProperties: false,
              description: "type list",
              properties: {
                button: { type: "string", maxLength: 20, description: "Texto del botón que abre la lista" },
                rows: {
                  type: "array",
                  minItems: 1,
                  maxItems: 10,
                  items: { type: "object", required: ["title"], properties: { id: { type: "string", maxLength: 200, description: "Llega como interactive.reply.id; por defecto row_1, row_2…" }, title: { type: "string", maxLength: 24 }, description: { type: "string", maxLength: 72 } } },
                },
              },
            },
            cta: {
              type: "object",
              required: ["label", "url"],
              additionalProperties: false,
              description: "type cta_url (WhatsApp)",
              properties: { label: { type: "string", maxLength: 20 }, url: { type: "string", format: "uri", description: "https" } },
            },
            location: {
              type: "object",
              required: ["latitude", "longitude"],
              additionalProperties: false,
              description: "type location (WhatsApp)",
              properties: { latitude: { type: "number", minimum: -90, maximum: 90 }, longitude: { type: "number", minimum: -180, maximum: 180 }, name: str, address: str },
            },
            replyTo: { type: "string", description: "Id de un mensaje de la misma conversación para citarlo (WhatsApp)" },
            product: {
              type: "object",
              required: ["id"],
              additionalProperties: false,
              description: "type product (WhatsApp). `text` es opcional",
              properties: { id: { type: "string", description: "product_retailer_id" }, catalogId: { type: "string", description: "Por omisión, el único conectado a la cuenta" } },
            },
            productList: {
              type: "object",
              required: ["header", "sections"],
              additionalProperties: false,
              description: "type product_list (WhatsApp), con `text`. Hasta 10 secciones y 30 productos",
              properties: {
                header: { type: "string", maxLength: 60 },
                sections: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", required: ["title", "productIds"], properties: { title: { type: "string", maxLength: 24 }, productIds: { type: "array", minItems: 1, items: str } } } },
                catalogId: str,
              },
            },
            catalog: { type: "object", additionalProperties: false, description: "type catalog (WhatsApp), con `text`", properties: { thumbnailProductId: { type: "string", description: "Producto cuya foto ilustra el mensaje" } } },
            flow: {
              type: "object",
              required: ["id", "cta"],
              additionalProperties: false,
              description: "type flow (WhatsApp), con `text`",
              properties: {
                id: { type: "string", description: "Id del Flow (GET /accounts/{id}/flows)" },
                cta: { type: "string", maxLength: 20, description: "Texto del botón" },
                header: { type: "string", maxLength: 60 },
                screen: { type: "string", description: "Primera pantalla (Flows sin endpoint)" },
                data: { type: "object", description: "Datos iniciales de esa pantalla (requiere screen)" },
                token: { type: "string", maxLength: 200, description: "Vuelve en flow.completed; por omisión Colibly genera uno" },
                draft: { type: "boolean", description: "Mandar el borrador del Flow (para probarlo)" },
              },
            },
            footer: { type: "string", maxLength: 60, description: "Pie de product, product_list, catalog o flow" },
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
