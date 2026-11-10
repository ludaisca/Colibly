import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Las etiquetas pertenecen a UNA cuenta (WhatsApp o canal) desde 2026-09-16 —
// ver el comentario de `model Tag`. Toda lectura/creación/asignación de
// etiquetas pasa por aquí para que el alcance no dependa de lo que mande el
// cliente.
export type TagScope = { waAccountId: string } | { channelAccountId: string } | { organizationId: string };

export interface TagScopeInput {
  waAccountId?: string | null;
  channelAccountId?: string | null;
  contactId?: string | null;
  // WAChat.id o Conversation.id (mismo criterio que lib/chat-resolver.ts)
  chatId?: string | null;
  // Etiquetas de la organización (contactos "sin canal"); solo admin.
  organization?: boolean;
}

// Resuelve la cuenta dueña de las etiquetas a partir de una cuenta explícita o
// de un contacto/chat, validando que el usuario tenga acceso. null = sin acceso
// o referencia inexistente (la ruta responde 404 en ambos casos).
export async function resolveTagScope(userId: string, input: TagScopeInput): Promise<TagScope | null> {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);

  if (input.organization) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true } });
    return me?.role === "admin" && me.organizationId ? { organizationId: me.organizationId } : null;
  }
  if (input.waAccountId) {
    return accountIds.includes(input.waAccountId) ? { waAccountId: input.waAccountId } : null;
  }
  if (input.channelAccountId) {
    return channelAccountIds.includes(input.channelAccountId) ? { channelAccountId: input.channelAccountId } : null;
  }
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { accountId: true, channelAccountId: true, organizationId: true },
    });
    if (contact && !contact.accountId && !contact.channelAccountId && contact.organizationId) {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true } });
      return me?.role === "admin" && me.organizationId === contact.organizationId ? { organizationId: contact.organizationId } : null;
    }
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
  tag: { waAccountId: string | null; channelAccountId: string | null; organizationId?: string | null },
  owner: { waAccountId?: string | null; channelAccountId?: string | null; organizationId?: string | null }
): boolean {
  if (owner.waAccountId) return tag.waAccountId === owner.waAccountId;
  if (owner.channelAccountId) return tag.channelAccountId === owner.channelAccountId;
  // Contacto sin canal: la etiqueta debe ser de su misma organización y sin cuenta.
  if (owner.organizationId) return !tag.waAccountId && !tag.channelAccountId && tag.organizationId === owner.organizationId;
  return false;
}

// Busca o crea una etiqueta por nombre en la cuenta del contacto — la API
// pública y las automatizaciones aceptan nombres ("VIP") además de ids.
export async function findOrCreateTag(
  owner: { accountId: string | null; channelAccountId: string | null; organizationId?: string | null },
  name: string
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  // Contacto sin canal: la etiqueta cuelga de la organización. El único es
  // parcial (SQL), así que no hay upsert: buscar y, si no está, crear.
  if (!owner.accountId && !owner.channelAccountId && owner.organizationId) {
    const where = { organizationId: owner.organizationId, waAccountId: null, channelAccountId: null, name: trimmed };
    const found = await prisma.tag.findFirst({ where, select: { id: true, name: true } });
    if (found) return found;
    try {
      return await prisma.tag.create({ data: { organizationId: owner.organizationId, name: trimmed }, select: { id: true, name: true } });
    } catch {
      const raced = await prisma.tag.findFirst({ where, select: { id: true, name: true } });
      if (raced) return raced;
      throw new Error("No se pudo crear la etiqueta");
    }
  }
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
