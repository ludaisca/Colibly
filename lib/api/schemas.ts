import { z } from "zod";
import { DEAL_VALUE_MAX_PESOS } from "@/lib/money";
import { OUTBOUND_MEDIA_TYPES } from "@/lib/messaging/outbound-media";
import { templateCreateSchema } from "@/lib/validations";
import { apiPhoneDigits } from "@/lib/phone/e164";

// Validación de entrada de la API pública (/api/v1). Mensajes en español,
// igual que lib/validations.ts; los `code` de error viven en respond.ts.

const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"]);

export const apiContactCreateSchema = z.object({
  accountId: z.string().min(1, "accountId es requerido"),
  phone: z
    .string()
    .transform(apiPhoneDigits)
    .refine((v) => v.length >= 8 && v.length <= 15, "phone debe tener entre 8 y 15 dígitos, con código de país (10 dígitos = México)"),
  name: z.string().trim().min(1).max(200).optional(),
  leadStatus: leadStatus.optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  customFields: z.record(z.string(), z.string().max(2000).nullable()).optional(),
});

export const apiContactUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    realName: z.string().trim().min(1).max(200).nullable().optional(),
    leadStatus: leadStatus.optional(),
    customFields: z.record(z.string(), z.string().max(2000).nullable()).optional(),
    // Valor del trato en centavos de MXN (mismo tope que la UI). null lo borra.
    dealValueCents: z
      .number()
      .int("dealValueCents debe ser un entero (centavos)")
      .min(0, "dealValueCents no puede ser negativo")
      .max(DEAL_VALUE_MAX_PESOS * 100, `dealValueCents máximo ${DEAL_VALUE_MAX_PESOS * 100}`)
      .nullable()
      .optional(),
    // Fecha estimada de cierre (ISO 8601). null la borra.
    expectedCloseAt: z
      .string()
      .max(40)
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "expectedCloseAt debe ser una fecha ISO 8601")
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nada que actualizar");

export const apiContactTagSchema = z
  .object({
    tagId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(60).optional(),
  })
  .refine((d) => !!d.tagId !== !!d.name, "Envía tagId o name (uno de los dos)");

const buttonSchema = z.object({
  id: z.string().trim().min(1).max(256).optional(),
  title: z.string().trim().min(1).max(20, "El título de un botón admite máximo 20 caracteres"),
});

// Teléfono con código de país (solo dígitos tras limpiar); 10 dígitos sin `+`
// se toman como México (apiPhoneDigits). Mismo criterio que POST /contacts.
const phoneSchema = z
  .string()
  .transform(apiPhoneDigits)
  .refine((v) => v.length >= 8 && v.length <= 15, "debe tener entre 8 y 15 dígitos, con código de país (10 dígitos = México)");

const httpsUrl = (field: string) =>
  z.string().trim().url(`${field} debe ser una URL`).max(2048).refine((v) => v.startsWith("https://"), `${field} debe usar https://`);

// type template: lo que pide cada plantilla está en GET /templates (`send`).
// bodyParams es una lista ({{1}}, {{2}}…) o un objeto ({{nombre}}).
const templateParamValues = z.union([
  z.array(z.string().max(1024)).max(20),
  z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/, "Los nombres de variable son minúsculas, números y _"), z.string().max(1024)),
]);
const templateButtonParam = z
  .object({
    index: z.number().int().min(0).max(9),
    payload: z.string().min(1).max(1000).optional(),
    urlParam: z.string().min(1).max(2000).optional(),
    couponCode: z.string().min(1).max(15, "couponCode admite máximo 15 caracteres").optional(),
    flowToken: z.string().min(1).max(200).optional(),
    flowData: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const templateSendSchema = z
  .object({
    id: z.string().min(1),
    bodyParams: templateParamValues.optional(),
    // Texto de la variable de la cabecera, o URL https / media id (POST /media) del archivo.
    headerParam: z.string().max(2048).nullable().optional(),
    headerLocation: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        name: z.string().trim().min(1).max(1000).optional(),
        address: z.string().trim().min(1).max(1000).optional(),
      })
      .strict()
      .optional(),
    buttonParam: z.string().max(1024).nullable().optional(),
    buttons: z.array(templateButtonParam).max(10).optional(),
    // Plantillas de autenticación.
    code: z.string().trim().min(1).max(15, "code admite máximo 15 caracteres").optional(),
    // Oferta por tiempo limitado.
    offerExpiresAt: z
      .string()
      .max(40)
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "offerExpiresAt debe ser una fecha ISO 8601")
      .optional(),
    cards: z
      .array(
        z
          .object({
            headerParam: z.string().max(2048).nullable().optional(),
            bodyParams: templateParamValues.optional(),
            buttons: z.array(templateButtonParam).max(2).optional(),
          })
          .strict()
      )
      .max(10)
      .optional(),
  })
  .strict();

/** Tipos de POST /messages. Los de la segunda fila solo existen en WhatsApp. */
export const API_SEND_TYPES = [
  "text", "buttons", "list", "template", ...OUTBOUND_MEDIA_TYPES,
  "sticker", "location", "location_request", "cta_url",
  "product", "product_list", "catalog", "flow", "contacts",
] as const;

const retailerId = z.string().trim().min(1).max(100);
const catalogIdField = z.string().trim().regex(/^\d{5,30}$/, "catalogId es el id numérico del catálogo de Meta").optional();

export const apiSendMessageSchema = z
  .object({
    // Destino: conversationId, contactId, o accountId + to (WhatsApp).
    conversationId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    to: phoneSchema.optional(),
    type: z.enum(API_SEND_TYPES),
    text: z.string().trim().min(1).max(4096).optional(),
    buttons: z.array(buttonSchema).min(1).max(3).optional(),
    // type list: el botón que abre la lista y hasta 10 opciones.
    list: z
      .object({
        button: z.string().trim().min(1).max(20, "list.button admite máximo 20 caracteres"),
        rows: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(200).optional(),
              title: z.string().trim().min(1).max(24, "El título de una opción admite máximo 24 caracteres"),
              description: z.string().trim().min(1).max(72, "La descripción de una opción admite máximo 72 caracteres").optional(),
            })
          )
          .min(1)
          .max(10, "Una lista admite máximo 10 opciones"),
      })
      .strict()
      .optional(),
    // type cta_url: un botón que abre una URL.
    cta: z.object({ label: z.string().trim().min(1).max(20, "cta.label admite máximo 20 caracteres"), url: httpsUrl("cta.url") }).strict().optional(),
    // type location.
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        name: z.string().trim().min(1).max(1000).optional(),
        address: z.string().trim().min(1).max(1000).optional(),
      })
      .strict()
      .optional(),
    template: templateSendSchema.optional(),
    // Archivo por URL o por id de POST /media (type image, document, audio, video o sticker).
    media: z
      .object({
        url: httpsUrl("media.url").optional(),
        id: z.string().trim().min(1).max(64).optional(),
        filename: z.string().trim().min(1).max(200).optional(),
        mimeType: z.string().trim().min(3).max(127).optional(),
      })
      .strict()
      .refine((m) => !!m.url !== !!m.id, "media lleva url o id (uno de los dos)")
      .optional(),
    // type contacts: tarjetas de contacto (vCard) como las de WhatsApp.
    contacts: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            firstName: z.string().trim().min(1).max(100).optional(),
            lastName: z.string().trim().min(1).max(100).optional(),
            phones: z
              .array(z.object({ phone: z.string().trim().min(3).max(30), type: z.string().trim().min(1).max(20).optional(), waId: z.string().trim().regex(/^\d{8,15}$/, "waId son solo dígitos").optional() }).strict())
              .max(5)
              .optional(),
            emails: z.array(z.object({ email: z.string().trim().email("email no válido").max(200), type: z.string().trim().min(1).max(20).optional() }).strict()).max(5).optional(),
            company: z.string().trim().min(1).max(200).optional(),
            title: z.string().trim().min(1).max(200).optional(),
            urls: z.array(z.object({ url: z.string().trim().url("url no válida").max(500), type: z.string().trim().min(1).max(20).optional() }).strict()).max(5).optional(),
            birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthday es YYYY-MM-DD").optional(),
          })
          .strict()
          .refine((c) => (c.phones?.length ?? 0) + (c.emails?.length ?? 0) > 0, "Cada contacto lleva al menos un teléfono o un correo")
      )
      .min(1)
      .max(10, "Hasta 10 contactos por mensaje")
      .optional(),
    caption: z.string().trim().min(1).max(1024, "caption admite máximo 1024 caracteres").optional(),
    // Id de Colibly del mensaje a citar (WhatsApp).
    replyTo: z.string().min(1).max(64).optional(),
    // Catálogo de Meta (WhatsApp). Sin catalogId se usa el único conectado a la cuenta.
    product: z.object({ id: retailerId, catalogId: catalogIdField }).strict().optional(),
    productList: z
      .object({
        header: z.string().trim().min(1).max(60, "productList.header admite máximo 60 caracteres"),
        sections: z
          .array(z.object({ title: z.string().trim().min(1).max(24, "El título de una sección admite máximo 24 caracteres"), productIds: z.array(retailerId).min(1) }).strict())
          .min(1)
          .max(10, "Meta admite hasta 10 secciones"),
        catalogId: catalogIdField,
      })
      .strict()
      .refine((l) => l.sections.reduce((n, s) => n + s.productIds.length, 0) <= 30, "Meta admite hasta 30 productos por lista")
      .optional(),
    catalog: z.object({ thumbnailProductId: retailerId.optional() }).strict().optional(),
    // WhatsApp Flow (GET /accounts/{id}/flows). Sin token, Colibly genera uno.
    flow: z
      .object({
        id: z.string().trim().regex(/^\d{5,30}$/, "flow.id es el id numérico del Flow de Meta"),
        cta: z.string().trim().min(1).max(20, "flow.cta admite máximo 20 caracteres"),
        header: z.string().trim().min(1).max(60, "flow.header admite máximo 60 caracteres").optional(),
        screen: z.string().trim().min(1).max(100).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        token: z.string().trim().min(1).max(200).optional(),
        draft: z.boolean().optional(),
      })
      .strict()
      .refine((f) => !f.data || !!f.screen, { message: "flow.data necesita flow.screen", path: ["data"] })
      .optional(),
    footer: z.string().trim().min(1).max(60, "footer admite máximo 60 caracteres").optional(),
  })
  .refine((d) => [!!d.conversationId, !!d.contactId, !!(d.accountId || d.to)].filter(Boolean).length === 1, "Envía conversationId, contactId o accountId + to (solo uno)")
  .refine((d) => !(d.accountId || d.to) || (!!d.accountId && !!d.to), { message: "accountId y to van juntos", path: ["to"] })
  .refine((d) => d.type !== "text" || !!d.text, { message: "text es requerido", path: ["text"] })
  .refine((d) => d.type !== "buttons" || (!!d.text && !!d.buttons), {
    message: "text y buttons son requeridos",
    path: ["buttons"],
  })
  .refine((d) => d.type !== "list" || (!!d.text && !!d.list), { message: "text y list son requeridos", path: ["list"] })
  .refine((d) => d.type !== "cta_url" || (!!d.text && !!d.cta), { message: "text y cta son requeridos", path: ["cta"] })
  .refine((d) => d.type !== "location" || !!d.location, { message: "location es requerido", path: ["location"] })
  .refine((d) => d.type !== "location_request" || !!d.text, { message: "text es requerido", path: ["text"] })
  .refine((d) => d.type !== "template" || !!d.template, { message: "template es requerido", path: ["template"] })
  .refine((d) => !takesMedia(d.type) || !!d.media, { message: "media es requerido para image, document, audio, video y sticker", path: ["media"] })
  .refine((d) => takesMedia(d.type) || !d.media, { message: "media solo va con type image, document, audio, video o sticker", path: ["media"] })
  .refine((d) => isMediaType(d.type) || !d.caption, { message: "caption solo va con un archivo; para texto usa text", path: ["caption"] })
  .refine((d) => d.type !== "audio" || !d.caption, { message: "Un audio no lleva caption", path: ["caption"] })
  .refine((d) => !d.list || d.type === "list", { message: "list solo va con type list", path: ["list"] })
  .refine((d) => !d.cta || d.type === "cta_url", { message: "cta solo va con type cta_url", path: ["cta"] })
  .refine((d) => !d.location || d.type === "location", { message: "location solo va con type location", path: ["location"] })
  .refine((d) => d.type !== "product" || !!d.product, { message: "product es requerido", path: ["product"] })
  .refine((d) => d.type !== "product_list" || (!!d.text && !!d.productList), { message: "text y productList son requeridos", path: ["productList"] })
  .refine((d) => d.type !== "catalog" || !!d.text, { message: "text es requerido", path: ["text"] })
  .refine((d) => !d.product || d.type === "product", { message: "product solo va con type product", path: ["product"] })
  .refine((d) => !d.productList || d.type === "product_list", { message: "productList solo va con type product_list", path: ["productList"] })
  .refine((d) => !d.catalog || d.type === "catalog", { message: "catalog solo va con type catalog", path: ["catalog"] })
  .refine((d) => d.type !== "flow" || (!!d.text && !!d.flow), { message: "text y flow son requeridos", path: ["flow"] })
  .refine((d) => !d.flow || d.type === "flow", { message: "flow solo va con type flow", path: ["flow"] })
  .refine((d) => d.type !== "contacts" || !!d.contacts, { message: "contacts es requerido", path: ["contacts"] })
  .refine((d) => !d.contacts || d.type === "contacts", { message: "contacts solo va con type contacts", path: ["contacts"] })
  .refine((d) => !d.footer || ["product", "product_list", "catalog", "flow"].includes(d.type), { message: "footer solo va con product, product_list, catalog o flow", path: ["footer"] });

function isMediaType(t: string): t is (typeof OUTBOUND_MEDIA_TYPES)[number] {
  return (OUTBOUND_MEDIA_TYPES as readonly string[]).includes(t);
}

function takesMedia(t: string): boolean {
  return isMediaType(t) || t === "sticker";
}

export const apiReactionSchema = z
  .object({
    // "" quita la reacción. Un solo emoji (con sus modificadores).
    emoji: z
      .string()
      .max(32)
      .refine((v) => v === "" || /^\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(v) || /^\p{Regional_Indicator}{2}$/u.test(v), "emoji debe ser un solo emoji, o \"\" para quitar la reacción"),
  })
  .strict();

export const apiMarkReadSchema = z
  .object({
    // Además de marcar leído, muestra "escribiendo…" al cliente (WhatsApp, hasta 25 s o hasta tu respuesta).
    typing: z.boolean().optional(),
  })
  .strict();

export const apiConversationUpdateSchema = z
  .object({
    status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
    // null = quitar la asignación.
    assignedToId: z.string().min(1).nullable().optional(),
    // null = sacarla de su equipo.
    teamId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.assignedToId !== undefined || d.teamId !== undefined, "Envía status, assignedToId, teamId o varios");

export type ApiSendMessageInput = z.infer<typeof apiSendMessageSchema>;

// ── Administración de la cuenta de WhatsApp (permiso whatsapp:manage) ──────

// PATCH /accounts/{id}/profile — solo los campos enviados; "" borra el campo
// (salvo `about`, que Meta exige con al menos 1 carácter). Topes de Meta.
export const apiBusinessProfileSchema = z
  .object({
    about: z.string().trim().min(1, "about no puede quedar vacío").max(139).optional(),
    address: z.string().trim().max(256).optional(),
    description: z.string().trim().max(512).optional(),
    email: z.union([z.literal(""), z.string().trim().email("email no es válido").max(128)]).optional(),
    websites: z.array(z.string().trim().url("cada sitio debe ser una URL").max(256).refine((v) => /^https?:\/\//.test(v), "cada sitio debe empezar con http:// o https://")).max(2, "Meta admite hasta 2 sitios").optional(),
    // Categoría de Meta (RETAIL, RESTAURANT, PROF_SERVICES…); Meta valida la lista.
    vertical: z.string().trim().regex(/^[A-Z_]{2,40}$/, "vertical es una categoría de Meta en mayúsculas, p. ej. RETAIL").optional(),
    // JPG o PNG de hasta 5 MB; Colibly lo descarga y lo sube a Meta.
    profilePictureUrl: httpsUrl("profilePictureUrl").optional(),
  })
  .strict()
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Envía al menos un campo del perfil");

// POST /accounts/{id}/blocked-users
export const apiBlockUsersSchema = z
  .object({
    phones: z.array(phoneSchema).min(1, "Envía al menos un teléfono").max(100, "Hasta 100 teléfonos por llamada"),
  })
  .strict();

// POST /templates y PATCH /templates/{id} — la definición completa
// (lib/whatsapp/template-definition.ts). Los archivos de ejemplo van como URL
// https (exampleUrl): Colibly los sube a Meta.
const uiTemplate = templateCreateSchema.shape;
const templateExamples = z.union([
  z.array(z.string().trim().min(1, "Ejemplo requerido").max(1024)).max(20),
  z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/, "Los nombres de variable son minúsculas, números y _"), z.string().trim().min(1, "Ejemplo requerido").max(1024)),
]);
const templateButtonDef = z
  .object({
    type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "FLOW", "VOICE_CALL"]),
    text: z.string().trim().min(1).max(25, "El texto de un botón admite máximo 25 caracteres").optional(),
    url: z.string().max(2000).optional(),
    urlExample: z.string().max(2000).optional(),
    phoneNumber: z.string().trim().max(25).optional(),
    example: z.string().trim().min(1).max(15, "El código de ejemplo admite máximo 15 caracteres").optional(),
    flowId: z.string().trim().max(30).optional(),
    flowAction: z.enum(["navigate", "data_exchange"]).optional(),
    navigateScreen: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const templateComponentsDef = z
  .object({
    header: z
      .object({
        format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]),
        text: z.string().max(60, "La cabecera admite 60 caracteres").optional(),
        exampleText: z.string().max(60).optional(),
        exampleUrl: httpsUrl("components.header.exampleUrl").optional(),
      })
      .strict()
      .optional(),
    body: z.string().min(1, "El cuerpo es requerido").max(1024, "El cuerpo es demasiado largo").optional(),
    bodyExamples: templateExamples.optional(),
    footer: z.string().max(60, "Máximo 60 caracteres").optional(),
    buttons: z.array(templateButtonDef).max(10, "Máximo 10 botones").optional(),
    limitedTimeOffer: z.object({ text: z.string().trim().min(1).max(16, "limitedTimeOffer.text admite máximo 16 caracteres"), hasExpiration: z.boolean() }).strict().optional(),
    carousel: z
      .array(
        z
          .object({
            header: z.object({ format: z.enum(["IMAGE", "VIDEO"]), exampleUrl: httpsUrl("carousel[].header.exampleUrl") }).strict(),
            body: z.string().min(1).max(160, "El cuerpo de una tarjeta admite máximo 160 caracteres").optional(),
            bodyExamples: templateExamples.optional(),
            buttons: z.array(templateButtonDef).min(1).max(2, "Una tarjeta lleva máximo 2 botones"),
          })
          .strict()
      )
      .min(2, "El carrusel lleva al menos 2 tarjetas")
      .max(10, "El carrusel lleva máximo 10 tarjetas")
      .optional(),
    authentication: z
      .object({
        otpType: z.enum(["COPY_CODE", "ONE_TAP", "ZERO_TAP"]),
        addSecurityRecommendation: z.boolean().optional(),
        codeExpirationMinutes: z.number().int().min(1).max(90).optional(),
        buttonText: z.string().trim().min(1).max(25).optional(),
        autofillText: z.string().trim().min(1).max(25).optional(),
        packageName: z.string().trim().min(1).max(224).optional(),
        signatureHash: z.string().trim().length(11, "signatureHash tiene 11 caracteres").optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const templateCategory = z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]);
export const apiTemplateCreateSchema = z
  .object({
    accountId: z.string().min(1, "accountId es requerido"),
    name: uiTemplate.name,
    language: uiTemplate.language,
    category: templateCategory.default("MARKETING"),
    components: templateComponentsDef,
  })
  .strict();
export const apiTemplateEditSchema = z
  .object({ category: templateCategory.optional(), components: templateComponentsDef })
  .strict();
export type ApiTemplateComponents = z.infer<typeof templateComponentsDef>;

export type ApiTemplateCreateInput = z.infer<typeof apiTemplateCreateSchema>;

// PATCH /accounts/{id}/conversational-automation — topes de Meta: hasta 4
// sugerencias de 80 caracteres y 30 comandos (nombre de 32, descripción de 256).
export const apiConversationalAutomationSchema = z
  .object({
    prompts: z.array(z.string().trim().min(1).max(80, "Cada sugerencia admite máximo 80 caracteres")).max(4, "Meta admite hasta 4 sugerencias").optional(),
    commands: z
      .array(
        z
          .object({
            // Sin la "/": la pone WhatsApp.
            name: z.string().trim().transform((v) => v.replace(/^\//, "")).pipe(z.string().min(1).max(32, "El nombre de un comando admite máximo 32 caracteres").regex(/^\S+$/, "El nombre de un comando no lleva espacios")),
            description: z.string().trim().min(1).max(256, "La descripción de un comando admite máximo 256 caracteres"),
          })
          .strict()
      )
      .max(30, "Meta admite hasta 30 comandos")
      .optional(),
    // Saludo a quien abre el chat por primera vez (lib/whatsapp/welcome.ts).
    // text: undefined conserva el actual, null lo borra.
    welcomeMessage: z
      .object({ enabled: z.boolean(), text: z.string().trim().max(1024, "welcomeMessage.text admite máximo 1024 caracteres").nullable().optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((d) => d.prompts !== undefined || d.commands !== undefined || d.welcomeMessage !== undefined, "Envía prompts, commands, welcomeMessage o varios");

// POST /accounts/{id}/qr-codes y PATCH …/{code}.
const prefilledMessage = z.string().trim().min(1, "prefilledMessage es requerido").max(140, "El mensaje prellenado admite máximo 140 caracteres");
export const apiQrCreateSchema = z.object({ prefilledMessage, format: z.enum(["PNG", "SVG"]).optional() }).strict();
export const apiQrUpdateSchema = z.object({ prefilledMessage }).strict();

// PATCH /accounts/{id}/catalog — ajustes de comercio del número.
export const apiCommerceSettingsSchema = z
  .object({ cartEnabled: z.boolean().optional(), catalogVisible: z.boolean().optional() })
  .strict()
  .refine((d) => d.cartEnabled !== undefined || d.catalogVisible !== undefined, "Envía cartEnabled, catalogVisible o ambos");

// POST /accounts/{id}/flows y PATCH …/flows/{flowId}. flowJson es el JSON del
// Flow (versión 6+ de Meta) como objeto.
const flowCategories = z.array(z.enum(["SIGN_UP", "SIGN_IN", "APPOINTMENT_BOOKING", "LEAD_GENERATION", "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "OTHER"])).min(1, "Elige al menos una categoría").max(8);
const flowJson = z
  .record(z.string(), z.unknown())
  .refine((j) => typeof j.version === "string" && Array.isArray(j.screens), "flowJson debe tener version y screens (formato de WhatsApp Flows)")
  .refine((j) => JSON.stringify(j).length <= 1_000_000, "flowJson supera 1 MB");
const endpointUri = httpsUrl("endpointUri").nullable();
export const apiFlowCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    categories: flowCategories,
    flowJson: flowJson.optional(),
    cloneFlowId: z.string().trim().regex(/^\d{5,30}$/, "cloneFlowId es el id numérico de un Flow").optional(),
    // Sin endpoint propio usa useColiblyEndpoint (PATCH /accounts/{id}/flows-endpoint).
    endpointUri: endpointUri.optional(),
    useColiblyEndpoint: z.boolean().optional(),
    publish: z.boolean().optional(),
  })
  .strict()
  .refine((d) => !(d.endpointUri && d.useColiblyEndpoint), "endpointUri o useColiblyEndpoint, no los dos");
export const apiFlowUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    categories: flowCategories.optional(),
    flowJson: flowJson.optional(),
    endpointUri: endpointUri.optional(),
    useColiblyEndpoint: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nada que actualizar")
  .refine((d) => !(d.endpointUri && d.useColiblyEndpoint), "endpointUri o useColiblyEndpoint, no los dos");

// PATCH /accounts/{id}/flows-endpoint — a dónde reenvía Colibly las
// solicitudes de los Flows con endpoint (data_exchange). null lo apaga.
export const apiFlowsEndpointSchema = z.object({ url: httpsUrl("url").nullable() }).strict();

// POST /onboarding-links — enlace para que un cliente conecte su número.
export const apiOnboardingLinkSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    reference: z.string().trim().min(1).max(200).optional(),
    redirectUrl: httpsUrl("redirectUrl").optional(),
    expiresInHours: z.number().int().min(1).max(720).optional(),
  })
  .strict();

// POST /accounts/{id}/two-step-pin y /register.
const sixDigitPin = z.string().regex(/^\d{6}$/, "pin son 6 dígitos");
export const apiTwoStepPinSchema = z.object({ pin: sixDigitPin }).strict();
export const apiRegisterNumberSchema = z.object({ pin: sixDigitPin.optional() }).strict();
export const apiDeregisterNumberSchema = z
  .object({ confirm: z.literal(true, { message: "Envía confirm: true: el número dejará de enviar y recibir mensajes" }) })
  .strict();
