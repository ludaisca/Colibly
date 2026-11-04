import type { Prisma } from "@prisma/client";
import { appUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import type { StructuredContent } from "@/lib/whatsapp/message-content";

// Forma pública de un mensaje: la ÚNICA que ven los integradores, tanto en la
// API (`GET /api/v1/conversations/{id}/messages`) como en los webhooks
// salientes (`message.*`, campo `message`). Antes cada lado armaba la suya con
// campos distintos (docs/META_JSON_CUENTAS_WA_2026-11-04.md §8).
//
// Contrato aditivo: los campos de la primera versión (id … timestamp) siguen
// iguales; lo nuevo se añadió detrás. La única corrección: `text` ya no trae
// marcadores como "[location]" — es null cuando el mensaje no tiene texto, y
// el dato vive en `content`.

// Columnas comunes a WAMessage y ChannelMessage, más las propias de cada tabla
// como opcionales (selecciónalas con MESSAGE_SERIALIZE_SELECT_*).
export interface SerializableMessage {
  id: string;
  direction: string;
  messageType: string;
  body: string | null;
  caption: string | null;
  mediaUrl?: string | null;
  mimeType: string | null;
  filename: string | null;
  bytesSize?: number | null;
  status: string | null;
  senderId: string | null;
  timestamp: Date;
  transcript?: string | null;
  interactivePayload?: Prisma.JsonValue;
  reactionEmoji?: string | null;
  agentReactionEmoji?: string | null;
  // WhatsApp
  wamid?: string | null;
  replyToWamid?: string | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  content?: Prisma.JsonValue;
  pricing?: Prisma.JsonValue;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  // Canales genéricos
  externalMessageId?: string | null;
  replyToExternalId?: string | null;
}

const COMMON_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  caption: true,
  mediaUrl: true,
  mimeType: true,
  filename: true,
  bytesSize: true,
  status: true,
  senderId: true,
  timestamp: true,
  transcript: true,
  interactivePayload: true,
  reactionEmoji: true,
  agentReactionEmoji: true,
} as const;

export const MESSAGE_SERIALIZE_SELECT_WA = {
  ...COMMON_SELECT,
  wamid: true,
  replyToWamid: true,
  errorCode: true,
  errorMessage: true,
  content: true,
  pricing: true,
  deliveredAt: true,
  readAt: true,
} satisfies Prisma.WAMessageSelect;

export const MESSAGE_SERIALIZE_SELECT_CHANNEL = {
  ...COMMON_SELECT,
  externalMessageId: true,
  replyToExternalId: true,
} satisfies Prisma.ChannelMessageSelect;

// El texto guardado era "[tipo]" cuando Meta no traía texto (ubicación,
// sticker, audio…). Para un integrador eso es indistinguible de un mensaje
// que diga literalmente "[sticker]", así que la API lo entrega como null.
export function publicText(body: string | null, messageType: string): string | null {
  if (!body) return null;
  if (body === `[${messageType}]` || /^\[[a-z_]+\]$/.test(body)) return null;
  return body;
}

const MEDIA_TYPES = new Set(["image", "video", "audio", "sticker", "document"]);

export interface PricingPublic {
  billable: boolean | null;
  model: string | null;
  category: string | null;
  type: string | null;
}

function publicPricing(raw: Prisma.JsonValue | undefined): PricingPublic | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return { billable: typeof p.billable === "boolean" ? p.billable : null, model: s(p.pricing_model), category: s(p.category), type: s(p.type) };
}

/**
 * `replyToMessageId` resuelve el id externo citado a un id de Colibly cuando
 * el caller ya lo buscó (lote por página en la API, uno en el webhook).
 */
export function serializeMessage(m: SerializableMessage, conversationId: string, opts: { replyToMessageId?: string | null } = {}) {
  const content = (m.content ?? null) as StructuredContent | null;
  const externalId = m.wamid ?? m.externalMessageId ?? null;
  const replyExternal = m.replyToWamid ?? m.replyToExternalId ?? null;
  const hasMedia = MEDIA_TYPES.has(m.messageType) && (!!m.mediaUrl || !!m.mimeType);
  return {
    // ── v1 ──
    id: m.id,
    conversationId,
    direction: m.direction,
    type: m.messageType,
    text: publicText(m.body, m.messageType),
    caption: m.caption,
    mimeType: m.mimeType,
    filename: m.filename,
    status: m.status,
    senderId: m.senderId,
    interactive: m.interactivePayload ?? null,
    timestamp: m.timestamp,
    // ── añadidos (2026-11-04) ──
    externalId,
    // Ubicación, contactos compartidos, pedido, aviso de sistema, reenvío,
    // sha256 del medio… (null = no hay más que lo de arriba).
    content,
    // El archivo se descarga de Colibly con la misma API key (la URL de Meta
    // caduca en minutos y nunca se expone). `ready: false` = aún se descarga.
    media: hasMedia
      ? {
          url: appUrl(`/api/v1/messages/${m.id}/media`),
          ready: !!m.mediaUrl,
          mimeType: m.mimeType,
          filename: m.filename,
          size: m.bytesSize ?? null,
          sha256: content?.media?.sha256 ?? null,
        }
      : null,
    replyTo: replyExternal ? { externalId: replyExternal, messageId: opts.replyToMessageId ?? null, from: content?.replyToFrom ?? null } : null,
    reaction: m.reactionEmoji || m.agentReactionEmoji ? { contact: m.reactionEmoji ?? null, agent: m.agentReactionEmoji ?? null } : null,
    transcript: m.transcript ?? null,
    error: m.errorCode != null || m.errorMessage ? { code: m.errorCode ?? null, message: m.errorMessage ?? null } : null,
    deliveredAt: m.deliveredAt ?? null,
    readAt: m.readAt ?? null,
    pricing: publicPricing(m.pricing),
  };
}

export type PublicMessage = ReturnType<typeof serializeMessage>;

/**
 * Ids de Colibly de los mensajes citados (por su id externo), en UNA consulta
 * por página/evento. Solo dentro de la misma conversación.
 */
export async function resolveReplyIds(
  kind: "whatsapp" | "channel",
  conversationId: string,
  rows: Pick<SerializableMessage, "replyToWamid" | "replyToExternalId">[]
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.replyToWamid ?? r.replyToExternalId).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  if (kind === "whatsapp") {
    const found = await prisma.wAMessage.findMany({ where: { chatId: conversationId, wamid: { in: ids } }, select: { id: true, wamid: true } });
    return new Map(found.filter((f) => f.wamid).map((f) => [f.wamid as string, f.id]));
  }
  const found = await prisma.channelMessage.findMany({ where: { conversationId, externalMessageId: { in: ids } }, select: { id: true, externalMessageId: true } });
  return new Map(found.filter((f) => f.externalMessageId).map((f) => [f.externalMessageId as string, f.id]));
}
