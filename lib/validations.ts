import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const onboardingSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  businessName: z.string().min(2, "El nombre del negocio debe tener al menos 2 caracteres"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Contraseña actual requerida"),
  newPassword: z.string().min(8, "Mínimo 8 caracteres"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const telegramAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  botToken: z.string().min(1, "El token del bot es requerido").regex(/^\d+:[\w-]+$/, "Formato de token inválido — cópialo tal cual te lo dio @BotFather"),
});

export type TelegramAccountInput = z.infer<typeof telegramAccountSchema>;

export const waAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  phoneNumberId: z.string().min(1, "El Phone Number ID es requerido").regex(/^\d+$/, "Debe ser un ID numérico"),
  accessToken: z.string().min(1, "El token de acceso es requerido"),
  wabaId: z.string().regex(/^\d+$/, "Debe ser un ID numérico").optional().or(z.literal("")),
  appId: z.string().regex(/^\d+$/, "Debe ser un ID numérico").optional().or(z.literal("")),
  verifyToken: z.string().min(6, "El verify token debe tener al menos 6 caracteres").optional().or(z.literal("")),
  appSecret: z.string().optional().or(z.literal("")),
});

export const waAccountUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  accessToken: z.string().min(1).optional(),
  verifyToken: z.string().min(6).optional(),
  appSecret: z.string().optional(),
  wabaId: z.string().optional(),
  appId: z.string().optional(),
});

export const sendMessageSchema = z.object({
  type: z.enum(["text", "image", "audio", "video", "document", "interactive"]),
  // 4096 es el límite de WhatsApp para texto libre — mejor un 400 claro aquí
  // que un error opaco de la Graph API.
  body: z.string().max(4096, "El mensaje supera el límite de 4096 caracteres de WhatsApp").optional(),
  mediaId: z.string().nullable().optional(),
  caption: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  localMediaPath: z.string().nullable().optional(),
  bytesSize: z.number().optional(),
  // Solo el título viaja desde el cliente — el id del botón (btn_1, btn_2...)
  // se genera en la ruta de envío, nunca se confía en lo que mande el cliente.
  buttons: z
    .array(z.object({ title: z.string().min(1).max(20, "Máximo 20 caracteres por botón") }))
    .min(1)
    .max(3, "Máximo 3 botones")
    .optional(),
}).refine(
  (d) => {
    if (d.type === "text") return !!d.body;
    if (d.type === "interactive") return !!d.body && !!d.buttons && d.buttons.length > 0;
    return !!d.mediaId || !!d.localMediaPath;
  },
  { message: "Se requiere body para texto, body+buttons para interactivo, o mediaId/localMediaPath para medios", path: ["body"] }
);

// Misma forma que sendMessageSchema (WhatsApp), sin "interactive"/buttons —
// los botones de respuesta rápida siguen siendo exclusivos de WhatsApp.
export const telegramSendMessageSchema = z.object({
  type: z.enum(["text", "image", "audio", "video", "document"]),
  body: z.string().max(4096, "El mensaje supera el límite de 4096 caracteres de Telegram").optional(),
  mediaId: z.string().nullable().optional(),
  caption: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  localMediaPath: z.string().nullable().optional(),
  bytesSize: z.number().optional(),
}).refine(
  (d) => d.type === "text" ? !!d.body : !!d.localMediaPath,
  { message: "Se requiere body para texto o localMediaPath para medios", path: ["body"] }
);

export type TelegramSendMessageInput = z.infer<typeof telegramSendMessageSchema>;

export type WaAccountInput = z.infer<typeof waAccountSchema>;
export type WaAccountUpdateInput = z.infer<typeof waAccountUpdateSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const botSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  // waAccountId y channelAccountId son mutuamente excluyentes: un bot atiende
  // una cuenta de WhatsApp o una de un canal adicional (Telegram), nunca las
  // dos — el pipeline de entrada las resuelve por separado.
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  provider: z.enum(["openrouter", "google"], { message: "Proveedor inválido" }),
  model: z.string().min(1, "El modelo es requerido"),
  systemPrompt: z.string().min(1, "El prompt del sistema es requerido"),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8192).optional(),
  memoryType: z.enum(["NONE", "RECENT", "SUMMARY"]).optional(),
  memoryLimit: z.number().min(1).max(100).optional(),
  ragEnabled: z.boolean().optional(),
  humanizeEnabled: z.boolean().optional(),
}).refine(
  (d) => !(d.waAccountId && d.channelAccountId),
  { message: "Un bot no puede atender una cuenta de WhatsApp y una de Telegram a la vez", path: ["channelAccountId"] }
);

// .partial() no existe en un ZodEffects (lo que devuelve .refine), así que el
// schema de update se declara aparte en vez de derivarse del de creación.
export const botUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  provider: z.enum(["openrouter", "google"], { message: "Proveedor inválido" }).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8192).optional(),
  memoryType: z.enum(["NONE", "RECENT", "SUMMARY"]).optional(),
  memoryLimit: z.number().min(1).max(100).optional(),
  ragEnabled: z.boolean().optional(),
  humanizeEnabled: z.boolean().optional(),
}).refine(
  (d) => !(d.waAccountId && d.channelAccountId),
  { message: "Un bot no puede atender una cuenta de WhatsApp y una de Telegram a la vez", path: ["channelAccountId"] }
);

export const LEAD_SCORER_SCHEDULE_INTERVALS = [15, 30, 60, 180, 360, 720, 1440] as const;

export const leadScorerBotSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  provider: z.enum(["openrouter", "google"], { message: "Proveedor inválido" }),
  model: z.string().min(1, "El modelo es requerido"),
  systemPrompt: z.string().min(1, "El prompt es requerido"),
  isActive: z.boolean().optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleIntervalMinutes: z
    .union(LEAD_SCORER_SCHEDULE_INTERVALS.map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]])
    .nullable()
    .optional(),
  // Empty/omitted = every account the user owns or has shared with them.
  scheduleAccountIds: z.array(z.string()).optional(),
  // Igual que scheduleAccountIds pero para cuentas de Telegram — campo
  // separado, no mezclado en el mismo arreglo (ver WALeadScorerBot.schema).
  scheduleChannelAccountIds: z.array(z.string()).optional(),
}).refine(
  (data) => !data.scheduleEnabled || data.scheduleIntervalMinutes != null,
  { message: "Selecciona cada cuánto debe ejecutarse el calificador", path: ["scheduleIntervalMinutes"] }
);

export const leadScorerBotUpdateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100).optional(),
  provider: z.enum(["openrouter", "google"], { message: "Proveedor inválido" }).optional(),
  model: z.string().min(1, "El modelo es requerido").optional(),
  systemPrompt: z.string().min(1, "El prompt es requerido").optional(),
  isActive: z.boolean().optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleIntervalMinutes: z
    .union(LEAD_SCORER_SCHEDULE_INTERVALS.map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]])
    .nullable()
    .optional(),
  scheduleAccountIds: z.array(z.string()).optional(),
  scheduleChannelAccountIds: z.array(z.string()).optional(),
});

export const campaignSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  waAccountId: z.string().min(1, "La cuenta es requerida"),
  waTemplateId: z.string().min(1, "La plantilla es requerida"),
  scheduledAt: z.string().datetime().optional().nullable(),
  headerParam: z.string().optional(),
  buttonParam: z.string().optional(),
  recipients: z.array(z.object({
    phoneNumber: z.string().min(1, "El número es requerido").regex(/^\d+$/, "Debe ser numérico"),
    contactName: z.string().optional(),
    parameters: z.record(z.string(), z.string()).optional(),
  })).min(1, "Al menos un destinatario es requerido"),
});

export const leadSheetSourceSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  waAccountId: z.string().min(1, "La cuenta es requerida"),
  waTemplateId: z.string().min(1, "La plantilla es requerida"),
  spreadsheetId: z.string().min(1, "La hoja de Google Sheets es requerida"),
  sheetName: z.string().min(1, "La pestaña es requerida"),
  phoneColumn: z.string().min(1, "La columna de teléfono es requerida"),
  nameColumn: z.string().optional(),
  bodyColumns: z.array(z.string()).default([]),
  headerParam: z.string().optional(),
  buttonParam: z.string().optional(),
});

export const leadSheetSourceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  headerParam: z.string().nullable().optional(),
  buttonParam: z.string().nullable().optional(),
});

export type BotInput = z.infer<typeof botSchema>;
export type BotUpdateInput = z.infer<typeof botUpdateSchema>;
export type LeadScorerBotInput = z.infer<typeof leadScorerBotSchema>;
export type LeadScorerBotUpdateInput = z.infer<typeof leadScorerBotUpdateSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type LeadSheetSourceInput = z.infer<typeof leadSheetSourceSchema>;
export type LeadSheetSourceUpdateInput = z.infer<typeof leadSheetSourceUpdateSchema>;

const headerFormatEnum = z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]);
const buttonTypeEnum = z.enum(["QUICK_REPLY", "URL"]);

export const templateCreateSchema = z.object({
  waAccountId: z.string().min(1, "La cuenta es requerida"),
  name: z.string()
    .min(1, "El nombre es requerido")
    .max(512, "El nombre es demasiado largo")
    .regex(/^[a-z][a-z0-9_]*$/, "Solo minúsculas, números y guiones bajos (debe empezar con letra)"),
  language: z.string().min(2, "El idioma es requerido").max(5).default("es"),
  components: z.object({
    header: z.object({
      format: headerFormatEnum,
      text: z.string().optional(),
      // A Resumable Upload API handle (lib/whatsapp/resumable-upload.ts), not a URL —
      // Meta requires binary media uploaded through that flow for template creation.
      exampleHandle: z.string().optional(),
    }).optional(),
    body: z.string().min(1, "El cuerpo es requerido").max(1024, "El cuerpo es demasiado largo"),
    // Meta requires one example value per {{n}} variable in the body — without
    // it the Graph API rejects template creation (error 132000).
    bodyExamples: z.array(z.string().min(1, "Ejemplo requerido")).optional(),
    footer: z.string().max(60, "Máximo 60 caracteres").optional(),
    buttons: z.array(z.object({
      type: buttonTypeEnum,
      text: z.string().min(1, "Texto requerido").max(25, "Máximo 25 caracteres"),
      url: z.string().url("URL inválida").optional(),
    })).max(10, "Máximo 10 botones").optional(),
  }),
});

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;

export const contactUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  leadStatus: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"]).optional(),
});

export const noteSchema = z.object({
  body: z.string().min(1, "La nota no puede estar vacía").max(2000, "Máximo 2000 caracteres"),
});

export const tagSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(50),
  color: z.string().max(30).optional(),
});

export const cannedResponseSchema = z.object({
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  shortcut: z
    .string()
    .min(1, "El atajo es requerido")
    .max(40)
    .regex(/^\S+$/, "El atajo no puede contener espacios")
    .transform((v) => v.toLowerCase().replace(/^\/+/, "")),
  content: z.string().min(1, "El contenido es requerido").max(2000),
}).refine(
  (d) => !!d.waAccountId !== !!d.channelAccountId,
  { message: "Selecciona una cuenta de WhatsApp o de Telegram", path: ["channelAccountId"] }
);

// PATCH solo edita shortcut/content — separado de cannedResponseSchema porque
// .partial() no funciona sobre un schema con .refine() (deja de ser un
// ZodObject), mismo motivo que ya separa botSchema/botUpdateSchema.
export const cannedResponseUpdateSchema = z.object({
  shortcut: z
    .string()
    .min(1, "El atajo es requerido")
    .max(40)
    .regex(/^\S+$/, "El atajo no puede contener espacios")
    .transform((v) => v.toLowerCase().replace(/^\/+/, ""))
    .optional(),
  content: z.string().min(1, "El contenido es requerido").max(2000).optional(),
});

export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type TagInput = z.infer<typeof tagSchema>;
export type CannedResponseInput = z.infer<typeof cannedResponseSchema>;
