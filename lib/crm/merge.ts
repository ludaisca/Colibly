import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalid, notFound } from "@/lib/crm/errors";
import { requireRoles, type CrmActor } from "@/lib/crm/access";
import { logActivity } from "@/lib/crm/activity";
import { mergePersonFields } from "@/lib/crm/merge-fields";
import { mergeSchema } from "@/lib/crm/schemas";

// Fusiona dos personas de la misma organización: TODAS las identidades de
// canal (chats, mensajes, notas, citas…) de la persona de origen pasan a la de
// destino, el destino conserva sus datos y solo completa sus vacíos, el
// historial de la persona de origen se traslada y la persona de origen se
// elimina. Es atómico: o se hace todo o nada. Solo admin y user.
export async function mergePeople(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin", "user"]);
  const { targetId, sourceId } = mergeSchema.parse(raw);
  if (targetId === sourceId) throw invalid("Elige dos contactos distintos");

  return prisma.$transaction(async (tx) => {
    const [target, source] = await Promise.all([
      tx.person.findFirst({ where: { id: targetId, organizationId: actor.organizationId } }),
      tx.person.findFirst({ where: { id: sourceId, organizationId: actor.organizationId } }),
    ]);
    if (!target || !source) throw notFound("Contacto");

    const { data, filled } = mergePersonFields(target, source);
    const moved = await tx.contact.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
    // El historial de la persona fusionada no se pierde: pasa al destino.
    await tx.activityLog.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
    await tx.person.delete({ where: { id: sourceId } });
    await tx.person.update({ where: { id: targetId }, data: { ...(data as Prisma.PersonUncheckedUpdateInput), version: { increment: 1 } } });
    await logActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type: "person.merged",
      personId: targetId,
      data: { sourceId, sourceName: source.name, channelsMoved: moved.count, filled },
    });
    return { targetId, channelsMoved: moved.count, filled };
  });
}
