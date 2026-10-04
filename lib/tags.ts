import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Las etiquetas pertenecen a UNA cuenta (WhatsApp o canal) desde 2026-09-16 —
// ver el comentario de `model Tag`. Toda lectura/creación/asignación de
// etiquetas pasa por aquí para que el alcance no dependa de lo que mande el
// cliente.
export type TagScope = { waAccountId: string } | { channelAccountId: string };

export interface TagScopeInput {
  waAccountId?: string | null;
  channelAccountId?: string | null;
  contactId?: string | null;
  // WAChat.id o Conversation.id (mismo criterio que lib/chat-resolver.ts)
  chatId?: string | null;
}

// Resuelve la cuenta dueña de las etiquetas a partir de una cuenta explícita o
// de un contacto/chat, validando que el usuario tenga acceso. null = sin acceso
// o referencia inexistente (la ruta responde 404 en ambos casos).
export async function resolveTagScope(userId: string, input: TagScopeInput): Promise<TagScope | null> {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);

  if (input.waAccountId) {
    return accountIds.includes(input.waAccountId) ? { waAccountId: input.waAccountId } : null;
  }
  if (input.channelAccountId) {
    return channelAccountIds.includes(input.channelAccountId) ? { channelAccountId: input.channelAccountId } : null;
  }
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { accountId: true, channelAccountId: true },
    });
    if (contact?.accountId && accountIds.includes(contact.accountId)) return { waAccountId: contact.accountId };
    if (contact?.channelAccountId && channelAccountIds.includes(contact.channelAccountId)) {
      return { channelAccountId: contact.channelAccountId };
    }
    return null;
  }
  if (input.chatId) {
    const chat = await prisma.wAChat.findUnique({ where: { id: input.chatId }, select: { accountId: true } });
    if (chat) return accountIds.includes(chat.accountId) ? { waAccountId: chat.accountId } : null;
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.chatId },
      select: { channelAccountId: true },
    });
    if (conversation && channelAccountIds.includes(conversation.channelAccountId)) {
      return { channelAccountId: conversation.channelAccountId };
    }
    return null;
  }
  return null;
}

// ¿La etiqueta pertenece a la cuenta de este contacto/chat/secuencia/regla?
// Sin esto, un tagId de otra cuenta (o de otro cliente) se podía asignar.
export function tagBelongsTo(
  tag: { waAccountId: string | null; channelAccountId: string | null },
  owner: { waAccountId?: string | null; channelAccountId?: string | null }
): boolean {
  if (owner.waAccountId) return tag.waAccountId === owner.waAccountId;
  if (owner.channelAccountId) return tag.channelAccountId === owner.channelAccountId;
  return false;
}

// Busca o crea una etiqueta por nombre en la cuenta del contacto — la API
// pública y las automatizaciones aceptan nombres ("VIP") además de ids.
export async function findOrCreateTag(
  owner: { accountId: string | null; channelAccountId: string | null },
  name: string
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  if (owner.accountId) {
    return prisma.tag.upsert({
      where: { waAccountId_name: { waAccountId: owner.accountId, name: trimmed } },
      create: { waAccountId: owner.accountId, name: trimmed },
      update: {},
      select: { id: true, name: true },
    });
  }
  return prisma.tag.upsert({
    where: { channelAccountId_name: { channelAccountId: owner.channelAccountId!, name: trimmed } },
    create: { channelAccountId: owner.channelAccountId!, name: trimmed },
    update: {},
    select: { id: true, name: true },
  });
}
