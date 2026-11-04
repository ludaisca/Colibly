import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OutboundTarget } from "@/lib/messaging/outbound";
import type { ApiContext } from "./auth";
import { ApiError } from "./respond";
import { toE164 } from "@/lib/phone/e164";

// Búsquedas acotadas al alcance de la key y forma pública de cada recurso.
// Todo id que llega por la API pasa por aquí: un id de otra cuenta responde
// 404 (no 403), para no confirmar que existe.

// ─── Contactos ──────────────────────────────────────────────────────────────

export const API_CONTACT_SELECT = {
  id: true,
  accountId: true,
  channelAccountId: true,
  channelAccount: { select: { channel: true } },
  remoteJid: true,
  name: true,
  realName: true,
  leadStatus: true,
  leadOrigin: true,
  adId: true,
  ctwaClid: true,
  dealValueCents: true,
  expectedCloseAt: true,
  optedOutMarketing: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true } } } },
  customFieldValues: { select: { value: true, definition: { select: { key: true } } } },
  chat: { select: { id: true } },
  conversation: { select: { id: true } },
} satisfies Prisma.ContactSelect;

type ApiContactRow = Prisma.ContactGetPayload<{ select: typeof API_CONTACT_SELECT }>;

export function contactScopeWhere(ctx: ApiContext): Prisma.ContactWhereInput {
  return {
    OR: [{ accountId: { in: ctx.accountIds } }, { channelAccountId: { in: ctx.channelAccountIds } }],
  };
}

export function serializeContact(c: ApiContactRow) {
  const isWhatsapp = c.accountId !== null;
  return {
    id: c.id,
    accountId: c.accountId ?? c.channelAccountId,
    channel: isWhatsapp ? "WHATSAPP" : (c.channelAccount?.channel ?? null),
    name: c.name,
    realName: c.realName,
    // `phone` es el wa_id de Meta tal cual (puede traer el "1" móvil de México);
    // `phoneE164` es el número normalizado para cruzar con otros sistemas.
    phone: isWhatsapp ? c.remoteJid : null,
    phoneE164: isWhatsapp ? toE164(c.remoteJid) : null,
    externalId: isWhatsapp ? null : c.remoteJid,
    leadStatus: c.leadStatus,
    leadOrigin: c.leadOrigin,
    // Anuncio de origen (first-touch): adId del anuncio CTWA o del Instant
    // Form; ctwaClid solo CTWA (el que se reporta a la Conversions API).
    adId: c.adId,
    ctwaClid: c.ctwaClid,
    // Valor del trato (centavos, siempre MXN) y fecha estimada de cierre.
    dealValueCents: c.dealValueCents,
    dealCurrency: "MXN" as const,
    expectedCloseAt: c.expectedCloseAt,
    optedOutMarketing: c.optedOutMarketing,
    tags: c.tags.map((t) => t.tag),
    customFields: Object.fromEntries(c.customFieldValues.map((v) => [v.definition.key, v.value])),
    conversationId: c.chat?.id ?? c.conversation?.id ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function findScopedContact(ctx: ApiContext, id: string): Promise<ApiContactRow> {
  const contact = await prisma.contact.findFirst({
    where: { id, ...contactScopeWhere(ctx) },
    select: API_CONTACT_SELECT,
  });
  if (!contact) throw new ApiError(404, "not_found", "Contacto no encontrado");
  return contact;
}

// ─── Conversaciones ─────────────────────────────────────────────────────────

export type ScopedConversation =
  | { kind: "whatsapp"; target: Extract<OutboundTarget, { kind: "whatsapp" }> }
  | { kind: "channel"; target: Extract<OutboundTarget, { kind: "channel" }> };

// conversationId = WAChat.id o Conversation.id (mismo criterio que lib/chat-resolver.ts).
export async function findScopedConversation(ctx: ApiContext, id: string): Promise<ScopedConversation> {
  const chat = await prisma.wAChat.findFirst({
    where: { id, accountId: { in: ctx.accountIds } },
    include: { account: true },
  });
  if (chat) return { kind: "whatsapp", target: { kind: "whatsapp", chat } };
  const conversation = await prisma.conversation.findFirst({
    where: { id, channelAccountId: { in: ctx.channelAccountIds } },
    include: { channelAccount: true },
  });
  if (conversation) return { kind: "channel", target: { kind: "channel", conversation } };
  throw new ApiError(404, "not_found", "Conversación no encontrada");
}

interface ConversationLike {
  id: string;
  name: string | null;
  contactId: string | null;
  status: string;
  assignedToId: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeConversation(c: ConversationLike, accountId: string, channel: string) {
  return {
    id: c.id,
    accountId,
    channel,
    contactId: c.contactId,
    name: c.name,
    status: c.status,
    assignedToId: c.assignedToId,
    unreadCount: c.unreadCount,
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    // Cambia con cualquier cambio de la conversación (mensaje, estado,
    // asignación, no leídos): el punto de control de `updatedSince`.
    updatedAt: c.updatedAt,
  };
}

// La forma pública de un mensaje vive en lib/messages/serialize.ts (compartida con los webhooks).
