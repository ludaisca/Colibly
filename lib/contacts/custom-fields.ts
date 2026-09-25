import { prisma } from "@/lib/prisma";

// Escribe campos personalizados por `key` (la API pública y las
// automatizaciones hablan en keys estables, no en ids de definición). Mismas
// reglas que PUT /api/whatsapp/contacts/[id]/custom-fields: null o "" borra el
// valor, y solo se aceptan definiciones de la cuenta del propio contacto.
// Devuelve las keys desconocidas para que el llamador decida si es un error.
export async function setCustomFieldsByKey(
  contact: { id: string; accountId: string | null; channelAccountId: string | null },
  values: Record<string, string | null>
): Promise<{ unknownKeys: string[] }> {
  const keys = Object.keys(values);
  if (keys.length === 0) return { unknownKeys: [] };

  const definitions = await prisma.contactCustomFieldDefinition.findMany({
    where: {
      key: { in: keys },
      ...(contact.accountId ? { waAccountId: contact.accountId } : { channelAccountId: contact.channelAccountId }),
    },
    select: { id: true, key: true },
  });
  const byKey = new Map(definitions.map((d) => [d.key, d.id]));
  const unknownKeys = keys.filter((k) => !byKey.has(k));
  if (unknownKeys.length > 0) return { unknownKeys };

  await prisma.$transaction(
    keys.map((key) => {
      const definitionId = byKey.get(key)!;
      const value = values[key];
      return value === null || value === ""
        ? prisma.contactCustomFieldValue.deleteMany({ where: { contactId: contact.id, definitionId } })
        : prisma.contactCustomFieldValue.upsert({
            where: { contactId_definitionId: { contactId: contact.id, definitionId } },
            create: { contactId: contact.id, definitionId, value },
            update: { value },
          });
    })
  );
  return { unknownKeys: [] };
}
