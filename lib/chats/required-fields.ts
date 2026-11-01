import { prisma } from "@/lib/prisma";
import { missingRequiredFields, type RequiredDefinition } from "./required-fields-rules";

export * from "./required-fields-rules";

type Kind = "whatsapp" | "channel";

async function requiredDefinitionsByAccount(kind: Kind, accountIds: string[]): Promise<Map<string, RequiredDefinition[]>> {
  const map = new Map<string, RequiredDefinition[]>();
  if (accountIds.length === 0) return map;
  const defs = await prisma.chatCustomFieldDefinition.findMany({
    where: kind === "whatsapp" ? { waAccountId: { in: accountIds }, required: true } : { channelAccountId: { in: accountIds }, required: true },
    select: { key: true, label: true, required: true, waAccountId: true, channelAccountId: true },
    orderBy: { order: "asc" },
  });
  for (const def of defs) {
    const accountId = (kind === "whatsapp" ? def.waAccountId : def.channelAccountId)!;
    map.set(accountId, [...(map.get(accountId) ?? []), def]);
  }
  return map;
}

/** Campos obligatorios vacíos de UN chat (vacío = se puede resolver). */
export async function missingRequiredForChat(kind: Kind, chatId: string): Promise<Array<{ key: string; label: string }>> {
  const chat =
    kind === "whatsapp"
      ? await prisma.wAChat.findUnique({ where: { id: chatId }, select: { accountId: true, customFields: true } })
      : await prisma.conversation.findUnique({ where: { id: chatId }, select: { channelAccountId: true, customFields: true } });
  if (!chat) return [];
  const accountId = "accountId" in chat ? chat.accountId : chat.channelAccountId;
  const defs = (await requiredDefinitionsByAccount(kind, [accountId])).get(accountId) ?? [];
  return missingRequiredFields(defs, chat.customFields);
}

/** Lote (bulk, auto-resolver): ids de los chats a los que les falta algún obligatorio. */
export async function chatsMissingRequired(
  kind: Kind,
  chats: Array<{ id: string; accountId: string; customFields: unknown }>
): Promise<Set<string>> {
  const defsByAccount = await requiredDefinitionsByAccount(kind, Array.from(new Set(chats.map((chat) => chat.accountId))));
  const blocked = new Set<string>();
  for (const chat of chats) {
    const defs = defsByAccount.get(chat.accountId);
    if (defs && missingRequiredFields(defs, chat.customFields).length > 0) blocked.add(chat.id);
  }
  return blocked;
}
