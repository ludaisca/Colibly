import { z } from "zod";

// Validación de entrada de la API pública (/api/v1). Mensajes en español,
// igual que lib/validations.ts; los `code` de error viven en respond.ts.

export const apiContactCreateSchema = z.object({
  accountId: z.string().min(1, "accountId es requerido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 8 && v.length <= 15, "phone debe tener entre 8 y 15 dígitos, con código de país"),
  name: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  customFields: z.record(z.string(), z.string().max(2000).nullable()).optional(),
});

export const apiContactUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    realName: z.string().trim().min(1).max(200).nullable().optional(),
    customFields: z.record(z.string(), z.string().max(2000).nullable()).optional(),
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
    type: z.enum(["text", "buttons", "template"]),
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
  })
  .refine((d) => !!d.conversationId !== !!d.contactId, "Envía conversationId o contactId (uno de los dos)")
  .refine((d) => d.type !== "text" || !!d.text, { message: "text es requerido", path: ["text"] })
  .refine((d) => d.type !== "buttons" || (!!d.text && !!d.buttons), {
    message: "text y buttons son requeridos",
    path: ["buttons"],
  })
  .refine((d) => d.type !== "template" || !!d.template, { message: "template es requerido", path: ["template"] });

export type ApiSendMessageInput = z.infer<typeof apiSendMessageSchema>;
