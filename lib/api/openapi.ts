import { API_SCOPES } from "./scopes";
import { DOMAIN_EVENT_CATALOG } from "@/lib/events/types";

// Especificación OpenAPI 3.1 de /api/v1, escrita a mano (la API es chica y
// estable; generarla desde zod agregaría una dependencia por poco). Si cambias
// un endpoint en app/api/v1, actualiza este archivo en el mismo cambio.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const paged = (item: string) => ({
  type: "object",
  properties: { data: { type: "array", items: ref(item) }, nextCursor: { type: ["string", "null"] } },
});
const json = (schema: object) => ({ "application/json": { schema } });
const ok = (schema: object, description = "OK") => ({ description, content: json(schema) });
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};
const pageParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "nextCursor de la página anterior" },
];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const scopeNote = (scope: string) => `Requiere el permiso \`${scope}\`.`;

export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "SundayCRM API",
      version: "1.0.0",
      description:
        "API pública de SundayCRM. Autenticación: `Authorization: Bearer sk_live_...` (API key creada por un admin en Configuración → API). " +
        "Límite: 120 solicitudes por minuto por key. Los errores tienen la forma `{ error: { code, message } }`.\n\n" +
        "**Webhooks salientes**: cada entrega es un POST con el evento en el cuerpo y el header " +
        "`X-Sunday-Signature: t=<unix>,v1=<hex>`, donde v1 = HMAC-SHA256(secret, `${t}.${cuerpo}`). " +
        "Responde 2xx en menos de 20 s; se reintenta hasta 6 veces con espera creciente.",
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    paths: {
      "/me": {
        get: { summary: "Identidad de la API key", responses: { "200": ok({ type: "object" }), ...errors } },
      },
      "/accounts": {
        get: {
          summary: "Cuentas al alcance de la key",
          responses: { "200": ok({ type: "object", properties: { data: { type: "array", items: ref("Account") } } }), ...errors },
        },
      },
      "/contacts": {
        get: {
          summary: "Listar contactos",
          description: scopeNote("contacts:read"),
          parameters: [
            ...pageParams,
            { name: "accountId", in: "query", schema: { type: "string" } },
            { name: "leadStatus", in: "query", schema: ref("LeadStatus") },
            { name: "tagId", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Nombre o teléfono" },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Contact")), ...errors },
        },
        post: {
          summary: "Crear contacto de WhatsApp (idempotente por teléfono)",
          description: `${scopeNote("contacts:write")} 201 si lo creó, 200 si el teléfono ya existía (no lo modifica).`,
          requestBody: { required: true, content: json(ref("ContactCreate")) },
          responses: { "201": ok(ref("Contact"), "Creado"), "200": ok(ref("Contact"), "Ya existía"), ...errors },
        },
      },
      "/contacts/{id}": {
        get: { summary: "Obtener contacto", description: scopeNote("contacts:read"), parameters: [idParam], responses: { "200": ok(ref("Contact")), ...errors } },
        patch: {
          summary: "Actualizar contacto",
          description: `${scopeNote("contacts:write")} Cambiar leadStatus dispara lo mismo que moverlo en el Pipeline (Meta CAPI, secuencias, webhooks).`,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("ContactUpdate")) },
          responses: { "200": ok(ref("Contact")), ...errors },
        },
      },
      "/contacts/{id}/tags": {
        post: {
          summary: "Agregar etiqueta (por id o por nombre)",
          description: scopeNote("contacts:write"),
          parameters: [idParam],
          requestBody: {
            required: true,
            content: json({ type: "object", properties: { tagId: { type: "string" }, name: { type: "string" } } }),
          },
          responses: { "200": ok(ref("Contact")), ...errors },
        },
        delete: {
          summary: "Quitar etiqueta",
          description: scopeNote("contacts:write"),
          parameters: [idParam, { name: "tagId", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": ok(ref("Contact")), ...errors },
        },
      },
      "/conversations": {
        get: {
          summary: "Listar conversaciones (todos los canales)",
          description: scopeNote("conversations:read"),
          parameters: [
            ...pageParams,
            { name: "accountId", in: "query", schema: { type: "string" } },
            { name: "channel", in: "query", schema: ref("Channel") },
            { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED"] } },
            { name: "assignedToId", in: "query", schema: { type: "string" } },
            { name: "contactId", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": ok(paged("Conversation")), ...errors },
        },
      },
      "/conversations/{id}": {
        get: { summary: "Obtener conversación", description: scopeNote("conversations:read"), parameters: [idParam], responses: { "200": ok(ref("Conversation")), ...errors } },
      },
      "/conversations/{id}/messages": {
        get: {
          summary: "Mensajes de una conversación (recientes primero)",
          description: scopeNote("conversations:read"),
          parameters: [idParam, ...pageParams],
          responses: { "200": ok(paged("Message")), ...errors },
        },
      },
      "/messages": {
        post: {
          summary: "Enviar mensaje",
          description:
            `${scopeNote("messages:send")} En WhatsApp, texto y botones solo dentro de la ventana de 24 h ` +
            "(fuera de ella: 422 window_closed → usa una plantilla aprobada). Una plantilla a un contacto sin chat abre el chat.",
          requestBody: { required: true, content: json(ref("SendMessage")) },
          responses: {
            "201": ok({ type: "object", properties: { id: { type: "string" }, conversationId: { type: "string" }, externalId: { type: ["string", "null"] } } }),
            "422": { $ref: "#/components/responses/Error" },
            "502": { $ref: "#/components/responses/Error" },
            ...errors,
          },
        },
      },
      "/webhooks": {
        get: { summary: "Listar webhooks", description: scopeNote("webhooks:manage"), responses: { "200": ok({ type: "object" }), ...errors } },
        post: {
          summary: "Crear webhook",
          description: `${scopeNote("webhooks:manage")} La respuesta incluye \`secret\` una sola vez.`,
          requestBody: { required: true, content: json(ref("WebhookCreate")) },
          responses: { "201": ok(ref("Webhook")), ...errors },
        },
      },
      "/webhooks/{id}": {
        get: { summary: "Obtener webhook", parameters: [idParam], responses: { "200": ok(ref("Webhook")), ...errors } },
        patch: {
          summary: "Editar / reactivar webhook",
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("WebhookCreate")) },
          responses: { "200": ok(ref("Webhook")), ...errors },
        },
        delete: { summary: "Eliminar webhook", parameters: [idParam], responses: { "200": ok({ type: "object" }), ...errors } },
      },
    },
    webhooks: {
      event: {
        post: {
          summary: "Evento entregado a tu URL",
          description: Object.entries(DOMAIN_EVENT_CATALOG)
            .map(([type, label]) => `- \`${type}\`: ${label}`)
            .join("\n"),
          requestBody: { content: json(ref("Event")) },
          responses: { "200": { description: "Recibido (cualquier 2xx)" } },
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
      responses: {
        Error: {
          description: "Error",
          content: json({
            type: "object",
            properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } },
          }),
        },
      },
      schemas: {
        LeadStatus: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"] },
        Channel: { type: "string", enum: ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"] },
        Account: {
          type: "object",
          properties: { id: { type: "string" }, channel: ref("Channel"), name: { type: "string" }, phoneNumber: { type: ["string", "null"] }, status: { type: "string" } },
        },
        Contact: {
          type: "object",
          properties: {
            id: { type: "string" },
            accountId: { type: "string" },
            channel: ref("Channel"),
            name: { type: ["string", "null"] },
            realName: { type: ["string", "null"] },
            phone: { type: ["string", "null"], description: "Solo WhatsApp" },
            externalId: { type: ["string", "null"], description: "Id del contacto en Telegram/Messenger/Instagram/Web" },
            leadStatus: ref("LeadStatus"),
            leadOrigin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
            optedOutMarketing: { type: "boolean" },
            tags: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } },
            customFields: { type: "object", additionalProperties: { type: ["string", "null"] } },
            conversationId: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ContactCreate: {
          type: "object",
          required: ["accountId", "phone"],
          properties: {
            accountId: { type: "string", description: "Cuenta de WhatsApp" },
            phone: { type: "string", description: "Con código de país, p. ej. 5215512345678" },
            name: { type: "string" },
            leadStatus: ref("LeadStatus"),
            tags: { type: "array", items: { type: "string" }, description: "Nombres; se crean si no existen" },
            customFields: { type: "object", additionalProperties: { type: ["string", "null"] }, description: "Por key del campo" },
          },
        },
        ContactUpdate: {
          type: "object",
          properties: {
            name: { type: "string" },
            realName: { type: ["string", "null"] },
            leadStatus: ref("LeadStatus"),
            customFields: { type: "object", additionalProperties: { type: ["string", "null"] }, description: "null o \"\" borra el valor" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            id: { type: "string" },
            accountId: { type: "string" },
            channel: ref("Channel"),
            contactId: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            status: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED"] },
            assignedToId: { type: ["string", "null"] },
            unreadCount: { type: "integer" },
            lastMessage: { type: ["string", "null"] },
            lastMessageAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Message: {
          type: "object",
          properties: {
            id: { type: "string" },
            conversationId: { type: "string" },
            direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] },
            type: { type: "string" },
            text: { type: ["string", "null"] },
            caption: { type: ["string", "null"] },
            mimeType: { type: ["string", "null"] },
            filename: { type: ["string", "null"] },
            status: { type: ["string", "null"] },
            senderId: { type: ["string", "null"] },
            interactive: {},
            timestamp: { type: "string", format: "date-time" },
          },
        },
        SendMessage: {
          type: "object",
          required: ["type"],
          description: "Envía conversationId o contactId (uno de los dos).",
          properties: {
            conversationId: { type: "string" },
            contactId: { type: "string" },
            type: { type: "string", enum: ["text", "buttons", "template"] },
            text: { type: "string" },
            buttons: {
              type: "array",
              maxItems: 3,
              items: { type: "object", required: ["title"], properties: { id: { type: "string" }, title: { type: "string", maxLength: 20 } } },
            },
            template: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string", description: "Id de la plantilla en SundayCRM" },
                bodyParams: { type: "array", items: { type: "string" } },
                headerParam: { type: ["string", "null"] },
                buttonParam: { type: ["string", "null"] },
              },
            },
          },
        },
        WebhookCreate: {
          type: "object",
          required: ["name", "url", "events"],
          properties: {
            name: { type: "string" },
            url: { type: "string", format: "uri", description: "https:// y pública" },
            events: { type: "array", items: { type: "string", enum: ["*", ...Object.keys(DOMAIN_EVENT_CATALOG)] } },
            accountIds: { type: "array", items: { type: "string" }, description: "Vacío = todas" },
            channelAccountIds: { type: "array", items: { type: "string" } },
            active: { type: "boolean" },
          },
        },
        Webhook: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            url: { type: "string" },
            events: { type: "array", items: { type: "string" } },
            active: { type: "boolean" },
            disabledAt: { type: ["string", "null"], format: "date-time" },
            consecutiveFailures: { type: "integer" },
            secret: { type: "string", description: "Solo al crear" },
          },
        },
        Event: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: Object.keys(DOMAIN_EVENT_CATALOG) },
            occurredAt: { type: "string", format: "date-time" },
            account: { type: ["object", "null"] },
            contact: { type: ["object", "null"] },
            conversation: { type: ["object", "null"] },
            data: { type: "object", description: "Depende del tipo (p. ej. from/to en contact.lead_status_changed)" },
          },
        },
      },
    },
  };
}
