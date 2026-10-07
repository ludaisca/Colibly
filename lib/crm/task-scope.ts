import type { Prisma } from "@prisma/client";
import { isRestricted, type CrmActor } from "@/lib/crm/access";

// Qué tareas puede ver el actor. Vive aparte de `tasks.ts` para poder usarla
// desde el historial sin importar el servicio de tareas (que importa el de
// personas, que a su vez necesita el historial).
export function taskVisibleWhere(actor: CrmActor): Prisma.TaskWhereInput {
  if (!isRestricted(actor)) return { organizationId: actor.organizationId };
  return {
    organizationId: actor.organizationId,
    OR: [{ assigneeId: actor.userId }, { person: { ownerId: actor.userId } }, { deal: { ownerId: actor.userId } }, { company: { ownerId: actor.userId } }],
  };
}
