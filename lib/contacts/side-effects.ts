import { enrollContactInTrigger } from "@/lib/sequences";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForContact } from "@/lib/events/refs";

// Los efectos de un cambio de etapa viven en lib/crm/deal-effects.ts.

// Efectos de agregar una etiqueta a un contacto (la fila ContactTag ya existe).
export async function afterContactTagAdded(contactId: string, tag: { id: string; name: string }): Promise<void> {
  await enrollContactInTrigger("TAG_ADDED", tag.id, contactId).catch((err) =>
    console.error("[contacts/tags] enrollContactInTrigger falló:", err)
  );
  const refs = await eventRefsForContact(contactId);
  if (refs) {
    await emitDomainEvent({ type: "tag.added", ...refs, data: { tagId: tag.id, tagName: tag.name, target: "contact" } });
  }
}
