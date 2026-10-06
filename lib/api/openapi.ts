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
        "Responde 2xx en menos de 20 s; se reintenta hasta 6 veces con espera creciente. " +
        "Los eventos de toda la organización (`task.created`, `task.completed`, `person.created` y los `deal.*` de negocios sin conversación) llegan con `account: null` y solo a webhooks que no estén limitados a ciertas cuentas.",
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
      "/people": {
        get: {
          summary: "Listar personas (los \"Contactos\" del CRM)",
          description: `${scopeNote("people:read")} Una persona agrupa sus canales (\`channels\`, con los ids de /contacts). Una key limitada a cuentas solo ve personas con un canal en ellas.`,
          parameters: [
            ...pageParams,
            { name: "q", in: "query", schema: { type: "string" }, description: "Nombre, correo, puesto, empresa o teléfono" },
            { name: "ownerId", in: "query", schema: { type: "string" }, description: "id, \"none\" o \"me\"" },
            { name: "companyId", in: "query", schema: { type: "string" } },
            { name: "lifecycle", in: "query", schema: { type: "string", enum: ["LEAD", "CUSTOMER"] } },
            { name: "archived", in: "query", schema: { type: "string", enum: ["exclude", "only", "include"], default: "exclude" } },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Person")), ...errors },
        },
        post: {
          summary: "Crear una persona",
          description: `${scopeNote("people:write")} Un correo o teléfono ya usado responde 409 salvo allowDuplicate. Cuenta para el límite de contactos del plan (402 plan_limit). Las keys limitadas a cuentas no pueden crear personas (403).`,
          requestBody: { required: true, content: json(ref("PersonCreate")) },
          responses: { "201": ok(ref("Person"), "Creada"), "409": { $ref: "#/components/responses/Error" }, ...errors },
        },
      },
      "/people/{id}": {
        get: { summary: "Obtener persona", description: scopeNote("people:read"), parameters: [idParam], responses: { "200": ok(ref("Person")), ...errors } },
        patch: {
          summary: "Editar o archivar una persona",
          description: `${scopeNote("people:write")} \`expectedVersion\` es opcional: sin ella se usa la versión vigente; con ella, una edición sobre una versión vieja responde 409.`,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("PersonUpdate")) },
          responses: { "200": ok(ref("Person")), "409": { $ref: "#/components/responses/Error" }, ...errors },
        },
      },
      "/companies": {
        get: {
          summary: "Listar empresas",
          description: scopeNote("companies:read"),
          parameters: [
            ...pageParams,
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "ownerId", in: "query", schema: { type: "string" } },
            { name: "archived", in: "query", schema: { type: "string", enum: ["exclude", "only", "include"], default: "exclude" } },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Company")), ...errors },
        },
        post: {
          summary: "Crear una empresa",
          description: `${scopeNote("companies:write")} Un nombre ya usado responde 409 salvo allowDuplicate. Las keys limitadas a cuentas no pueden crear empresas (403).`,
          requestBody: { required: true, content: json(ref("CompanyCreate")) },
          responses: { "201": ok(ref("Company"), "Creada"), "409": { $ref: "#/components/responses/Error" }, ...errors },
        },
      },
      "/companies/{id}": {
        get: { summary: "Obtener empresa", description: scopeNote("companies:read"), parameters: [idParam], responses: { "200": ok(ref("Company")), ...errors } },
        patch: {
          summary: "Editar o archivar una empresa",
          description: scopeNote("companies:write"),
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("CompanyCreate")) },
          responses: { "200": ok(ref("Company")), "409": { $ref: "#/components/responses/Error" }, ...errors },
        },
      },
      "/tasks": {
        get: {
          summary: "Listar tareas",
          description: scopeNote("tasks:read"),
          parameters: [
            ...pageParams,
            { name: "status", in: "query", schema: { type: "string", enum: ["open", "done", "all"], default: "open" } },
            { name: "assigneeId", in: "query", schema: { type: "string" }, description: "id o \"none\"" },
            { name: "personId", in: "query", schema: { type: "string" } },
            { name: "companyId", in: "query", schema: { type: "string" } },
            { name: "dealId", in: "query", schema: { type: "string" } },
            { name: "due", in: "query", schema: { type: "string", enum: ["overdue", "today", "week", "none"] } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": ok(paged("Task")), ...errors },
        },
        post: {
          summary: "Crear una tarea",
          description: `${scopeNote("tasks:write")} Debe ligarse a una persona, empresa o negocio. Sin assigneeId queda a nombre del dueño de la key. Emite el webhook task.created.`,
          requestBody: { required: true, content: json(ref("TaskCreate")) },
          responses: { "201": ok(ref("Task"), "Creada"), ...errors },
        },
      },
      "/tasks/{id}": {
        get: { summary: "Obtener tarea", description: scopeNote("tasks:read"), parameters: [idParam], responses: { "200": ok(ref("Task")), ...errors } },
        patch: {
          summary: "Editar, completar o reabrir una tarea",
          description: `${scopeNote("tasks:write")} status "DONE" la completa (webhook task.completed), "OPEN" la reabre.`,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref("TaskUpdate")) },
          responses: { "200": ok(ref("Task")), ...errors },
        },
        delete: { summary: "Borrar una tarea", description: scopeNote("tasks:write"), parameters: [idParam], responses: { "200": ok({ type: "object", properties: { ok: { type: "boolean" } } }), ...errors } },
      },
      "/reports/{report}": {
        get: {
          summary: "Reportes de ventas",
          description:
            `${scopeNote("reports:read")} Solo lectura, de toda la organización (una key limitada a cuentas recibe 403). ` +
            "Rendimiento (summary, owners, loss-reasons, trend) por fecha de cierre; atribución y embudo (origins, funnel) por cohorte de negocios creados en el periodo. " +
            "Las tasas son null cuando no hay base. Importes en la moneda de la organización.",
          parameters: [
            { name: "report", in: "path", required: true, schema: { type: "string", enum: ["summary", "funnel", "owners", "origins", "loss-reasons", "trend", "forecast"] } },
            { name: "pipelineId", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string" }, description: "YYYY-MM-DD (día local de la organización) o ISO; por defecto, hace 90 días" },
            { name: "to", in: "query", schema: { type: "string" }, description: "YYYY-MM-DD (inclusive) o ISO; por defecto, hoy" },
            { name: "ownerId", in: "query", schema: { type: "string" }, description: "id o \"none\"" },
            { name: "leadOrigin", in: "query", schema: { type: "string", enum: ["ORGANIC", "INSTANT_FORM", "CTWA"] } },
            { name: "adId", in: "query", schema: { type: "string" } },
            { name: "granularity", in: "query", schema: { type: "string", enum: ["day", "week", "month"] }, description: "Solo trend" },
          ],
          responses: { "200": ok({ type: "object", description: "La forma depende del reporte" }), ...errors },
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
        Person: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            jobTitle: { type: ["string", "null"] },
            lifecycle: { type: "string", enum: ["LEAD", "CUSTOMER"] },
            source: { type: ["string", "null"], description: "manual, import, api, whatsapp, instagram…" },
            ownerId: { type: ["string", "null"] },
            company: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            channels: { type: "array", items: { type: "object", properties: { contactId: { type: "string" }, accountId: { type: "string" }, channel: ref("Channel") } } },
            version: { type: "integer" },
            archivedAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        PersonCreate: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            jobTitle: { type: ["string", "null"] },
            companyId: { type: ["string", "null"] },
            ownerId: { type: ["string", "null"] },
            lifecycle: { type: "string", enum: ["LEAD", "CUSTOMER"] },
            allowDuplicate: { type: "boolean" },
          },
        },
        PersonUpdate: {
          type: "object",
          properties: {
            expectedVersion: { type: "integer" },
            name: { type: "string" },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            jobTitle: { type: ["string", "null"] },
            companyId: { type: ["string", "null"] },
            ownerId: { type: ["string", "null"] },
            lifecycle: { type: "string", enum: ["LEAD", "CUSTOMER"] },
            archived: { type: "boolean" },
          },
        },
        Company: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            domain: { type: ["string", "null"] },
            industry: { type: ["string", "null"] },
            size: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            ownerId: { type: ["string", "null"] },
            peopleCount: { type: "integer" },
            version: { type: "integer" },
            archivedAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CompanyCreate: {
          type: "object",
          properties: {
            expectedVersion: { type: "integer", description: "Solo en PATCH" },
            name: { type: "string" },
            domain: { type: ["string", "null"] },
            industry: { type: ["string", "null"] },
            size: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            ownerId: { type: ["string", "null"] },
            allowDuplicate: { type: "boolean", description: "Solo al crear" },
            archived: { type: "boolean", description: "Solo en PATCH" },
          },
        },
        TaskKind: { type: "string", enum: ["TODO", "CALL", "MESSAGE", "EMAIL", "MEETING"] },
        Task: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            notes: { type: ["string", "null"] },
            kind: ref("TaskKind"),
            status: { type: "string", enum: ["OPEN", "DONE"] },
            dueAt: { type: ["string", "null"], format: "date-time" },
            remindMinutesBefore: { type: ["integer", "null"] },
            overdue: { type: "boolean" },
            completedAt: { type: ["string", "null"], format: "date-time" },
            assigneeId: { type: ["string", "null"] },
            personId: { type: ["string", "null"] },
            companyId: { type: ["string", "null"] },
            dealId: { type: ["string", "null"] },
            source: { type: "string", enum: ["manual", "stage_rule", "api", "automation"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TaskCreate: {
          type: "object",
          required: ["title"],
          description: "Debe traer personId, companyId o dealId (un negocio completa su persona).",
          properties: {
            title: { type: "string", maxLength: 200 },
            notes: { type: ["string", "null"] },
            kind: ref("TaskKind"),
            dueAt: { type: ["string", "null"], format: "date-time" },
            remindMinutesBefore: { type: ["integer", "null"], description: "Omitido = al llegar la hora; null = sin aviso" },
            assigneeId: { type: ["string", "null"] },
            personId: { type: ["string", "null"] },
            companyId: { type: ["string", "null"] },
            dealId: { type: ["string", "null"] },
          },
        },
        TaskUpdate: {
          type: "object",
          properties: {
            title: { type: "string" },
            notes: { type: ["string", "null"] },
            kind: ref("TaskKind"),
            dueAt: { type: ["string", "null"], format: "date-time" },
            remindMinutesBefore: { type: ["integer", "null"] },
            assigneeId: { type: ["string", "null"] },
            status: { type: "string", enum: ["OPEN", "DONE"] },
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
            account: { type: ["object", "null"], description: "null en los eventos de toda la organización (task.*, person.created y negocios sin conversación): solo llegan a webhooks sin recorte de cuentas" },
            contact: { type: ["object", "null"] },
            conversation: { type: ["object", "null"] },
            data: { type: "object", description: "Depende del tipo (p. ej. stage/fromStage/amount en deal.stage_changed)" },
          },
        },
      },
    },
  };
}
