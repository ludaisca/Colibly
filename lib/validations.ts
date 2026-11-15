import { z } from "zod";
import { DEAL_VALUE_MAX_PESOS } from "@/lib/money";
import { MAX_SEATS } from "@/lib/billing/plans";

// Email normalizado (trim + minúsculas) ANTES de validar el formato — lib/auth.ts
// busca al usuario con el email en minúsculas, así que cualquier alta que lo
// guarde tal cual lo tecleó ("Luis@Empresa.com") deja a esa persona sin poder
// iniciar sesión nunca. Usar este campo en todo schema que cree o busque usuarios.
export const emailField = z.string().trim().toLowerCase().min(1, "El correo es obligatorio").email("El correo no es válido");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "La contraseña es requerida"),
});

// Alta de un cliente nuevo: crea su organización (prueba gratis) y su usuario
// dueño — ver lib/organizations.ts.
export const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  email: emailField,
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  businessName: z.string().trim().min(2, "El nombre del negocio debe tener al menos 2 caracteres").max(100),
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
const newPasswordField = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200);

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Enlace inválido").max(200),
  password: newPasswordField,
});

export const invitationSchema = z.object({
  email: emailField,
  role: z.enum(["admin", "user", "ejecutivo"], { message: "Rol inválido" }),
  // Licencia con la que entra (si no viene: una libre, o la de la prueba).
  license: z.enum(["ESSENTIAL", "BUSINESS", "PRO"], { message: "Licencia inválida" }).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Enlace inválido").max(200),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  password: newPasswordField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
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
  // Obligatorio: el webhook descarta todo payload cuya firma no valida, y sin
  // secreto la firma nunca valida — una cuenta sin él no recibe ni un mensaje.
  appSecret: z.string({ error: "El App Secret es requerido" }).trim().min(1, "El App Secret es requerido"),
});

export const waAccountUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  accessToken: z.string().min(1).optional(),
  verifyToken: z.string().min(6).optional(),
  // Se puede reemplazar, nunca vaciar (ver waAccountSchema).
  appSecret: z.string().trim().min(1, "El App Secret no puede quedar vacío").optional(),
  wabaId: z.string().optional(),
  appId: z.string().optional(),
});

export const metaAdsAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  pageId: z.string().min(1, "El Page ID es requerido").regex(/^\d+$/, "Debe ser un ID numérico"),
  pageAccessToken: z.string().min(1, "El token de la página es requerido"),
  // Obligatorio por la misma razón que WAAccount.appSecret: sin él
  // validateMetaWebhookSignature rechaza todo leadgen.
  appSecret: z.string({ error: "El App Secret es requerido" }).trim().min(1, "El App Secret es requerido"),
  verifyToken: z.string().min(6, "El verify token debe tener al menos 6 caracteres").optional().or(z.literal("")),
  datasetId: z.string().optional().or(z.literal("")),
  capiAccessToken: z.string().optional().or(z.literal("")),
  waAccountId: z.string().min(1).optional().nullable(),
  testEventCode: z.string().optional().or(z.literal("")),
});

export const metaAdsAccountUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pageAccessToken: z.string().min(1).optional(),
  appSecret: z.string().trim().min(1, "El App Secret no puede quedar vacío").optional(),
  verifyToken: z.string().min(6).optional(),
  datasetId: z.string().optional(),
  capiAccessToken: z.string().optional(),
  waAccountId: z.string().min(1).optional().nullable(),
  mode: z.enum(["TEST", "LIVE"]).optional(),
  testEventCode: z.string().optional(),
});

export type MetaAdsAccountInput = z.infer<typeof metaAdsAccountSchema>;
export type MetaAdsAccountUpdateInput = z.infer<typeof metaAdsAccountUpdateSchema>;

export const sendMessageSchema = z.object({
  type: z.enum(["text", "image", "audio", "video", "document", "interactive", "sticker"]),
  stickerId: z.string().min(1).optional(),
  // 4096 es el límite de WhatsApp para texto libre — mejor un 400 claro aquí
  // que un error opaco de la Graph API.
  body: z.string().max(4096, "El mensaje supera el límite de 4096 caracteres de WhatsApp").optional(),
  mediaId: z.string().nullable().optional(),
  caption: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  localMediaPath: z.string().nullable().optional(),
  bytesSize: z.number().optional(),
  replyToMessageId: z.string().min(1).optional(),
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
    if (d.type === "sticker") return !!d.stickerId && !d.body && !d.caption;
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
  replyToMessageId: z.string().optional(),
}).refine(
  (d) => d.type === "text" ? !!d.body : !!d.localMediaPath,
  { message: "Se requiere body para texto o localMediaPath para medios", path: ["body"] }
);

export type TelegramSendMessageInput = z.infer<typeof telegramSendMessageSchema>;

// A diferencia de WAAccount.appSecret (opcional por diseño — ver docs/arquitectura/whatsapp.md),
// aquí appSecret es requerido: la resolución de cuenta del webhook
// compartido de Messenger/Instagram no tiene un fallback de confianza
// análogo al phone_number_id de WhatsApp — sin secreto, la firma nunca
// valida y la cuenta jamás recibiría un mensaje.
export const messengerAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  pageId: z.string().min(1, "El Page ID es requerido").regex(/^\d+$/, "Debe ser un ID numérico"),
  pageAccessToken: z.string().min(1, "El token de la página es requerido"),
  appSecret: z.string().min(1, "El App Secret es requerido"),
});

export type MessengerAccountInput = z.infer<typeof messengerAccountSchema>;

// Instagram (modelo Página-vinculada) comparte pageId+pageAccessToken con
// Messenger, pero necesita además instagramBusinessId: entry[].id en el
// webhook de IG reporta el ID de Instagram, no el de la Página.
export const instagramAccountSchema = messengerAccountSchema.extend({
  instagramBusinessId: z.string().min(1, "El Instagram Business ID es requerido").regex(/^\d+$/, "Debe ser un ID numérico"),
});

export type InstagramAccountInput = z.infer<typeof instagramAccountSchema>;

export const metaChannelSendMessageSchema = z.object({
  type: z.enum(["text", "image", "audio", "video", "document"]),
  body: z.string().max(2000, "El mensaje supera el límite de 2000 caracteres").optional(),
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

export type MetaChannelSendMessageInput = z.infer<typeof metaChannelSendMessageSchema>;

// Roadmap P3-f — MVP solo texto (sin medios), tanto para el agente humano
// (chats/[chatId]/send) como para el visitante anónimo del widget
// (api/webchat/[accountId]/messages).
export const webchatAgentSendSchema = z.object({
  body: z.string().min(1, "El mensaje no puede estar vacío").max(2000, "El mensaje supera el límite de 2000 caracteres"),
});

export const webchatAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  // El header Origin real del navegador nunca lleva slash ni path final
  // (solo protocolo+host+puerto) — se recorta aquí para que un valor pegado
  // como "https://miempresa.com/" no falle el match por un detalle invisible.
  allowedOrigins: z
    .array(z.string().url("Cada dominio debe ser una URL válida (ej. https://miempresa.com)").transform((v) => v.replace(/\/+$/, "")))
    .min(1, "Agrega al menos un dominio permitido"),
});

export type WaAccountInput = z.infer<typeof waAccountSchema>;
export type WaAccountUpdateInput = z.infer<typeof waAccountUpdateSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const botSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  // waAccountId y channelAccountId son mutuamente excluyentes: un bot atiende
  // una cuenta de WhatsApp o una de un canal adicional, nunca las
  // dos — el pipeline de entrada las resuelve por separado.
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  // provider/model NO vienen del cliente — la plataforma los asigna sola
  // (lib/ai/platform.ts:pickCuratedModel()), el cliente nunca elige ni sabe cuál usa.
  systemPrompt: z.string().min(1, "El prompt del sistema es requerido"),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8192).optional(),
  memoryType: z.enum(["NONE", "RECENT", "SUMMARY"]).optional(),
  memoryLimit: z.number().min(1).max(100).optional(),
  ragEnabled: z.boolean().optional(),
  humanizeEnabled: z.boolean().optional(),
  // Citas Fase 2 — solo tiene efecto hoy en el pipeline de WhatsApp
  // (lib/workers/bot-worker.ts); se admite en el schema para cualquier bot,
  // pero el _form.tsx solo lo muestra cuando el bot atiende una WAAccount.
  appointmentSchedulingEnabled: z.boolean().optional(),
}).refine(
  (d) => !(d.waAccountId && d.channelAccountId),
  { message: "Un bot no puede atender dos cuentas a la vez", path: ["channelAccountId"] }
);

// .partial() no existe en un ZodEffects (lo que devuelve .refine), así que el
// schema de update se declara aparte en vez de derivarse del de creación.
export const botUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  systemPrompt: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8192).optional(),
  memoryType: z.enum(["NONE", "RECENT", "SUMMARY"]).optional(),
  memoryLimit: z.number().min(1).max(100).optional(),
  ragEnabled: z.boolean().optional(),
  humanizeEnabled: z.boolean().optional(),
  appointmentSchedulingEnabled: z.boolean().optional(),
}).refine(
  (d) => !(d.waAccountId && d.channelAccountId),
  { message: "Un bot no puede atender dos cuentas a la vez", path: ["channelAccountId"] }
);

export const LEAD_SCORER_SCHEDULE_INTERVALS = [15, 30, 60, 180, 360, 720, 1440] as const;

export const leadScorerBotSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  // provider/model los asigna la plataforma sola, ver botSchema arriba.
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
    // Se normaliza en el servidor (lib/campaigns/recipients.ts): México por defecto, sin duplicados.
    phoneNumber: z.string().trim().min(1, "El número es requerido").max(40),
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
  // Meta cobra y modera distinto cada categoría. AUTHENTICATION (códigos de un
  // solo uso) tiene otra estructura y no se crea desde aquí.
  category: z.enum(["MARKETING", "UTILITY"]).default("MARKETING"),
  components: z.object({
    header: z.object({
      format: headerFormatEnum,
      text: z.string().max(60, "La cabecera admite 60 caracteres").optional(),
      // Meta exige un ejemplo cuando el texto de la cabecera lleva {{1}}.
      exampleText: z.string().max(60).optional(),
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
      // Puede terminar en {{1}} (URL dinámica); entonces urlExample es obligatorio.
      url: z.string().max(2000).optional(),
      // Ejemplo completo de la URL con la variable ya resuelta.
      urlExample: z.string().max(2000).optional(),
    })).max(10, "Máximo 10 botones").optional(),
  }),
});

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(120),
  phone: z.string().trim().min(1, "El teléfono es requerido").max(40),
  // Sin cuenta, el contacto se crea "sin canal" y se vincula al conectar WhatsApp.
  accountId: z.string().min(1).optional().nullable(),
  tagIds: z.array(z.string().min(1)).max(20).optional(),
});

export const contactUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  leadStatus: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"]).optional(),
  pipelineStageId: z.string().min(1).max(64).optional(),
  // Valor del trato en PESOS (la ruta lo guarda en centavos). null lo borra.
  dealValue: z.number().finite().min(0, "El valor no puede ser negativo").max(DEAL_VALUE_MAX_PESOS, "Máximo $20,000,000").nullable().optional(),
  // Fecha estimada de cierre (YYYY-MM-DD o ISO). null la borra.
  expectedCloseAt: z.string().max(40).refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida").nullable().optional(),
});

export const noteSchema = z.object({
  body: z.string().min(1, "La nota no puede estar vacía").max(2000, "Máximo 2000 caracteres"),
});

export const routingRuleSchema = z.object({
  conditionType: z.enum(["TAG", "LEAD_ORIGIN", "SCORE_LABEL"]),
  conditionValue: z.string().min(1, "Selecciona un valor"),
  assignedToId: z.string().min(1, "Selecciona un usuario"),
});

// Roadmap P3-a — secuencia lineal (sin ramas). waAccountId/channelAccountId
// mutuamente excluyentes se resuelven en la ruta (mismo criterio que
// cannedResponseSchema), no aquí.
export const sequenceStepSchema = z.object({
  delayMinutes: z.number().int().min(0).max(43_200, "Máximo 30 días de espera"), // 30 días
  message: z.string().min(1, "El mensaje es requerido").max(2000),
});

export const sequenceSchema = z.object({
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  active: z.boolean().optional(),
  triggerType: z.enum(["TAG_ADDED", "LEAD_STATUS_CHANGED", "APPOINTMENT_COMPLETED"]),
  triggerValue: z.string().min(1).optional().nullable(),
  exitOnReply: z.boolean().optional(),
  steps: z.array(sequenceStepSchema).min(1, "Agrega al menos un paso"),
});

export const sequenceUpdateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100).optional(),
  active: z.boolean().optional(),
  triggerType: z.enum(["TAG_ADDED", "LEAD_STATUS_CHANGED", "APPOINTMENT_COMPLETED"]).optional(),
  triggerValue: z.string().min(1).optional().nullable(),
  exitOnReply: z.boolean().optional(),
  steps: z.array(sequenceStepSchema).min(1, "Agrega al menos un paso").optional(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(50),
  color: z.string().max(30).optional(),
  // Alcance de la etiqueta: una cuenta explícita, o el contacto/chat desde el
  // que se crea (la cuenta se resuelve en el servidor) — ver lib/tags.ts.
  waAccountId: z.string().min(1).optional(),
  channelAccountId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  // Etiquetas de contactos "sin canal" (antes de conectar WhatsApp): de la organización.
  organization: z.boolean().optional(),
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

export const appointmentSchema = z.object({
  contactId: z.string().min(1, "El contacto es requerido"),
  title: z.string().min(1, "El título es requerido").max(200),
  notes: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  reminderMinutesBefore: z.number().int().min(0).max(10080).optional(),
  originMessageId: z.string().min(1).optional().nullable(),
});

// PATCH: todo opcional (reagendar, reasignar, cambiar de estado) — separado
// de appointmentSchema en vez de .partial() porque agrega status/cancelReason,
// que no aplican al create (una cita siempre nace SCHEDULED).
export const appointmentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  reminderMinutesBefore: z.number().int().min(0).max(10080).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  cancelReason: z.string().max(500).optional().nullable(),
});

export const CONTACT_CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"] as const;

export const contactCustomFieldDefinitionSchema = z.object({
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  // Slug estable — minúsculas/números/guion bajo, sin espacios, para que sea
  // un identificador seguro de usar como key en cualquier export/consumidor
  // futuro (CSV, filtros) sin necesitar escapado.
  key: z
    .string()
    .min(1, "La clave es requerida")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo, sin espacios"),
  label: z.string().min(1, "El nombre es requerido").max(100),
  type: z.enum(CONTACT_CUSTOM_FIELD_TYPES).default("TEXT"),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
}).refine(
  (d) => !!d.waAccountId !== !!d.channelAccountId,
  { message: "Selecciona una cuenta de WhatsApp o de Telegram", path: ["channelAccountId"] }
);

// PATCH no permite cambiar `key` — es el identificador estable que ya puede
// tener valores guardados apuntándole; renombrar solo toca `label`. Separado
// de contactCustomFieldDefinitionSchema en vez de .partial() por el mismo
// motivo que cannedResponseUpdateSchema: .partial() no sobrevive a .refine().
export const contactCustomFieldDefinitionUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  type: z.enum(CONTACT_CUSTOM_FIELD_TYPES).optional(),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

// Upsert en bloque de los valores de un contacto — { [definitionId]: value }.
// value null/"" borra el valor guardado en vez de guardar un string vacío.
export const contactCustomFieldValuesSchema = z.object({
  values: z.record(z.string(), z.string().max(2000).nullable()),
});

export const CHAT_CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"] as const;

export const chatCustomFieldDefinitionSchema = z.object({
  waAccountId: z.string().min(1).optional().nullable(),
  channelAccountId: z.string().min(1).optional().nullable(),
  key: z
    .string()
    .min(1, "La clave es requerida")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo, sin espacios"),
  label: z.string().min(1, "El nombre es requerido").max(100),
  type: z.enum(CHAT_CUSTOM_FIELD_TYPES).default("TEXT"),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
}).refine(
  (d) => !!d.waAccountId !== !!d.channelAccountId,
  { message: "Selecciona una cuenta de WhatsApp o de canal", path: ["channelAccountId"] }
);

export const chatCustomFieldDefinitionUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  type: z.enum(CHAT_CUSTOM_FIELD_TYPES).optional(),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const chatCustomFieldValuesSchema = z.object({
  values: z.record(z.string(), z.string().max(2000).nullable()),
});

export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type TagInput = z.infer<typeof tagSchema>;
export type CannedResponseInput = z.infer<typeof cannedResponseSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type ContactCustomFieldDefinitionInput = z.infer<typeof contactCustomFieldDefinitionSchema>;
export type ContactCustomFieldDefinitionUpdateInput = z.infer<typeof contactCustomFieldDefinitionUpdateSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// PATCH /api/configuracion/ia — configuración operativa de la organización
// (horario, zona horaria, recuperación de leads). La IA la provee la
// plataforma: aquí ya no hay keys, proveedor ni presupuesto.
export const orgAiSettingsUpdateSchema = z
  .object({
    timezone: z.string().refine(isValidTimeZone, "Zona horaria inválida").optional(),
    businessHourStart: z.number().int().min(0).max(23).optional(),
    businessHourEnd: z.number().int().min(1).max(24).optional(),
    leadRecoveryEnabled: z.boolean().optional(),
    leadRecoveryFirstMessageHours: z.number().int("Usa horas enteras").min(1, "Mínimo 1 hora").max(168, "Máximo 168 horas (7 días)").optional(),
    leadRecoverySecondMessageHours: z.number().int("Usa horas enteras").min(1, "Mínimo 1 hora").max(168, "Máximo 168 horas (7 días)").nullable().optional(),
    // Auto-resolver (lib/inbox/auto-resolve.ts): null lo apaga.
    autoResolveAfterHours: z.number().int("Usa horas enteras").min(1, "Mínimo 1 hora").max(720, "Máximo 720 horas (30 días)").nullable().optional(),
    autoResolveMessage: z.string().trim().max(1000, "Máximo 1000 caracteres").nullable().optional()
      .transform((v) => (v ? v : v === undefined ? undefined : null)),
    autoResolveTagName: z.string().trim().max(50, "Máximo 50 caracteres").nullable().optional()
      .transform((v) => (v ? v : v === undefined ? undefined : null)),
    autoResolveSkipWaiting: z.boolean().optional(),
    // Días hábiles (0 = domingo … 6 = sábado) y aviso fuera de horario.
    businessDays: z.array(z.number().int().min(0).max(6)).min(1, "Elige al menos un día hábil").max(7)
      .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b)).optional(),
    awayMessageEnabled: z.boolean().optional(),
    autoTranscribeAudio: z.boolean().optional(),
    // SLA de la bandeja (lib/sla/): el interruptor se guarda como slaEnabledAt.
    slaEnabled: z.boolean().optional(),
    slaResponseMinutes: z.number().int("Usa minutos enteros").min(5, "Mínimo 5 minutos").max(1440, "Máximo 1440 minutos (24 h)").optional(),
    slaResolutionHours: z.number().int("Usa horas enteras").min(1, "Mínimo 1 hora").max(720, "Máximo 720 horas (30 días)").optional(),
    slaBusinessHoursOnly: z.boolean().optional(),
    awayMessageText: z.string().trim().max(1000, "Máximo 1000 caracteres").nullable().optional()
      .transform((v) => (v ? v : v === undefined ? undefined : null)),
  })
  .refine(
    (d) =>
      d.leadRecoveryFirstMessageHours === undefined ||
      d.leadRecoverySecondMessageHours === undefined ||
      d.leadRecoverySecondMessageHours === null ||
      d.leadRecoverySecondMessageHours > d.leadRecoveryFirstMessageHours,
    { message: "El mensaje 2 debe esperar más horas que el mensaje 1", path: ["leadRecoverySecondMessageHours"] }
  )
  .refine((d) => d.businessHourStart === undefined || d.businessHourEnd === undefined || d.businessHourEnd > d.businessHourStart, {
    message: "La hora de cierre debe ser posterior a la de apertura",
    path: ["businessHourEnd"],
  });

// Licencias contratadas por plan (Checkout y cambio de licencias).
export const licenseCountsSchema = z
  .object({
    ESSENTIAL: z.number().int().min(0).max(MAX_SEATS),
    BUSINESS: z.number().int().min(0).max(MAX_SEATS),
    PRO: z.number().int().min(0).max(MAX_SEATS),
  })
  .refine((c) => c.ESSENTIAL + c.BUSINESS + c.PRO >= 1 && c.ESSENTIAL + c.BUSINESS + c.PRO <= MAX_SEATS, {
    message: `Entre 1 y ${MAX_SEATS} licencias en total`,
  });

