import { z } from "zod";
import { DEAL_VALUE_MAX_PESOS } from "@/lib/money";
import { OUTBOUND_MEDIA_TYPES } from "@/lib/messaging/outbound-media";

// Validación de entrada de la API pública (/api/v1). Mensajes en español,
// igual que lib/validations.ts; los `code` de error viven en respond.ts.

const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"]);

export const apiContactCreateSchema = z.object({
  accountId: z.string().min(1, "accountId es requerido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 8 && v.length <= 15, "phone debe tener entre 8 y 15 dígitos, con código de país"),
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

export const apiSendMessageSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
    type: z.enum(["text", "buttons", "template", ...OUTBOUND_MEDIA_TYPES]),
    text: z.string().trim().min(1).max(4096).optional(),
    buttons: z.array(buttonSchema).min(1).max(3).optional(),
    template: z
      .object({
        id: z.string().min(1),
        bodyParams: z.array(z.string().max(1024)).max(20).optional(),
        headerParam: z.string().max(1024).nullable().optional(),
        buttonParam: z.string().max(1024).nullable().optional(),
      })
      .optional(),
    // Archivo por URL (type image, document, audio o video).
    media: z
      .object({
        url: z.string().trim().url("media.url debe ser una URL").max(2048).refine((v) => v.startsWith("https://"), "media.url debe usar https://"),
        filename: z.string().trim().min(1).max(200).optional(),
        mimeType: z.string().trim().min(3).max(127).optional(),
      })
      .strict()
      .optional(),
    caption: z.string().trim().min(1).max(1024, "caption admite máximo 1024 caracteres").optional(),
  })
  .refine((d) => !!d.conversationId !== !!d.contactId, "Envía conversationId o contactId (uno de los dos)")
  .refine((d) => d.type !== "text" || !!d.text, { message: "text es requerido", path: ["text"] })
  .refine((d) => d.type !== "buttons" || (!!d.text && !!d.buttons), {
    message: "text y buttons son requeridos",
    path: ["buttons"],
  })
  .refine((d) => d.type !== "template" || !!d.template, { message: "template es requerido", path: ["template"] })
  .refine((d) => !isMediaType(d.type) || !!d.media, { message: "media es requerido para image, document, audio y video", path: ["media"] })
  .refine((d) => isMediaType(d.type) || !d.media, { message: "media solo va con type image, document, audio o video", path: ["media"] })
  .refine((d) => isMediaType(d.type) || !d.caption, { message: "caption solo va con un archivo; para texto usa text", path: ["caption"] })
  .refine((d) => d.type !== "audio" || !d.caption, { message: "Un audio no lleva caption", path: ["caption"] });

function isMediaType(t: string): t is (typeof OUTBOUND_MEDIA_TYPES)[number] {
  return (OUTBOUND_MEDIA_TYPES as readonly string[]).includes(t);
}

export const apiConversationUpdateSchema = z
  .object({
    status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
    // null = quitar la asignación.
    assignedToId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.assignedToId !== undefined, "Envía status, assignedToId o ambos");

export type ApiSendMessageInput = z.infer<typeof apiSendMessageSchema>;
