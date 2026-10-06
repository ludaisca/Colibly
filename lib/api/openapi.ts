import { API_SCOPES } from "./scopes";
import { DOMAIN_EVENT_CATALOG } from "@/lib/events/types";
import { BRAND_NAME } from "@/lib/brand";

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
  "402": { $ref: "#/components/responses/Error", description: "plan_limit (la API es del plan Pro, o se alcanzó un límite del plan) o read_only (cuenta en solo lectura: solo GET)" },
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
      title: `${BRAND_NAME} API`,
      version: "1.0.0",
      description:
        `API pública de ${BRAND_NAME}. ` +
        "Autenticación: `Authorization: Bearer sk_live_...` (API key creada por un admin en Configuración → API). " +
        "Límite: 120 solicitudes por minuto por key. Los errores tienen la forma `{ error: { code, message } }`.\n\n" +
        "**Webhooks salientes**: cada entrega es un POST con el evento en el cuerpo y el header " +
        "`X-Colibly-Signature: t=<unix>,v1=<hex>`, donde v1 = HMAC-SHA256(secret, `${t}.${cuerpo}`). " +
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
            { name: "stageId", in: "query", schema: { type: "string" }, description: "Contactos cuya persona tiene un negocio abierto en esa etapa" },
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
          description: `${scopeNote("contacts:write")} La etapa de venta ya no se cambia aquí: usa PATCH /deals/{id}.`,
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
      "/pipelines": {
        get: {
          summary: "Pipelines, etapas, motivos de pérdida y moneda",
          description: `${scopeNote("deals:read")} Los ids de etapa y de motivo son los que piden los endpoints de negocios.`,
          responses: { "200": ok(ref("PipelinesResponse")), ...errors },
        },
      },
      "/deals": {
        get: {
          summary: "Listar negocios",
          description: scopeNote("deals:read"),
          parameters: [
            ...pageParams,
            { name: "pipelineId", in: "query", schema: { type: "string" } },
            { name: "stageId", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: ref("DealStatus") },
            { name: "contactId", in: "query", schema: { type: "string" } },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Deal")), ...errors },
        },
        post: {
          summary: "Abrir un negocio para un contacto",
          description: `${scopeNote("deals:write")} Sin stageId/pipelineId entra a la primera etapa del pipeline predeterminado. Un negocio nuevo siempre entra a una etapa abierta.`,
          requestBody: { required: true, content: json(ref("DealCreate")) },
          responses: { "201": ok(ref("Deal"), "Creado"), ...errors },
        },
      },
      "/deals/{id}": {
        get: { summary: "Obtener negocio", description: scopeNote("deals:read"), parameters: [idParam], responses: { "200": ok(ref("Deal")), ...errors } },
        patch: {
          summary: "Editar un negocio y/o moverlo de etapa",
          description:
            `${scopeNote("deals:write")} Con stageId lo mueve: a una etapa de tipo WON lo gana, a una de tipo LOST lo pierde (exige lostReasonId). ` +
            "Un cambio de etapa dispara Meta CAPI (leads de anuncios), secuencias y los webhooks deal.stage_changed / deal.won / deal.lost.",
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("DealUpdate")) },
          responses: { "200": ok(ref("Deal")), "409": { $ref: "#/components/responses/Error" }, ...errors },
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
      "/automations/{id}/runs": {
        post: {
          summary: "Iniciar una automatización manual para un contacto",
          description: `${scopeNote("automations:run")} Solo automatizaciones activas con disparador “Manual”. 409 si ya hay una ejecución en curso para ese contacto u otra automatización conversacional atiende su chat.`,
          parameters: [idParam],
          requestBody: {
            required: true,
            content: json({ type: "object", required: ["contactId"], properties: { contactId: { type: "string" }, vars: { type: "object", additionalProperties: { type: "string" }, description: "Disponibles como {{var.x}}" } } }),
          },
          responses: { "201": ok({ type: "object", properties: { runId: { type: "string" } } }), "409": { $ref: "#/components/responses/Error" }, ...errors },
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
        DealStatus: { type: "string", enum: ["OPEN", "WON", "LOST"] },
        PipelinesResponse: {
          type: "object",
          properties: {
            currency: { type: "string", description: "Moneda (ISO 4217) de los importes de toda la organización" },
            pipelines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  isDefault: { type: "boolean" },
                  stages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        position: { type: "integer" },
                        type: ref("DealStatus"),
                        probability: { type: "integer", description: "% de cierre por defecto de la etapa" },
                      },
                    },
                  },
                },
              },
            },
            lossReasons: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } },
          },
        },
        Deal: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            amount: { type: "number", description: "En la moneda de la organización" },
            probability: { type: ["integer", "null"], description: "Fijada a mano; null = la de la etapa" },
            probabilityEffective: { type: "integer" },
            weightedAmount: { type: "number" },
            expectedCloseDate: { type: ["string", "null"], format: "date-time" },
            status: ref("DealStatus"),
            pipelineId: { type: "string" },
            stageId: { type: "string" },
            stage: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, outcome: ref("DealStatus") } },
            stageEnteredAt: { type: "string", format: "date-time" },
            closedAt: { type: ["string", "null"], format: "date-time" },
            lostReason: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            lossNote: { type: ["string", "null"] },
            personId: { type: "string" },
            contactId: { type: ["string", "null"], description: "Conversación (canal) a la que está ligado" },
            ownerId: { type: ["string", "null"] },
            leadOrigin: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] },
            adId: { type: ["string", "null"] },
            source: { type: ["string", "null"] },
            version: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        DealCreate: {
          type: "object",
          required: ["contactId"],
          properties: {
            contactId: { type: "string", description: "Contacto (canal) del que sale el negocio" },
            title: { type: "string", description: "Por defecto, el nombre del contacto" },
            amount: { type: "number" },
            pipelineId: { type: "string" },
            stageId: { type: "string", description: "Debe ser una etapa abierta" },
            probability: { type: ["integer", "null"] },
            expectedCloseDate: { type: "string", format: "date" },
          },
        },
        DealUpdate: {
          type: "object",
          properties: {
            title: { type: "string" },
            amount: { type: "number" },
            probability: { type: ["integer", "null"] },
            expectedCloseDate: { type: ["string", "null"], format: "date" },
            stageId: { type: "string", description: "Mueve el negocio a esa etapa" },
            lostReasonId: { type: ["string", "null"], description: "Obligatorio al mover a una etapa de tipo LOST" },
            lostNote: { type: ["string", "null"] },
          },
        },
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
            personId: { type: "string", description: "La persona (\"Contacto\" en la interfaz) detrás de este canal" },
            openDeal: {
              type: ["object", "null"],
              description: "Negocio abierto más reciente de la persona",
              properties: { id: { type: "string" }, pipelineId: { type: "string" }, stageId: { type: "string" }, stageName: { type: "string" } },
            },
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
            tags: { type: "array", items: { type: "string" }, description: "Nombres; se crean si no existen" },
            customFields: { type: "object", additionalProperties: { type: ["string", "null"] }, description: "Por key del campo" },
          },
        },
        ContactUpdate: {
          type: "object",
          properties: {
            name: { type: "string" },
            realName: { type: ["string", "null"] },
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
                id: { type: "string", description: `Id de la plantilla en ${BRAND_NAME}` },
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
            data: { type: "object", description: "Depende del tipo (p. ej. stage/fromStage/amount en deal.stage_changed)" },
          },
        },
      },
    },
  };
}
