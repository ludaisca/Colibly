import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// ¿Puede asignarse una cita a `candidateUserId` dado que pertenece a la
// cuenta de `contact`? Reutiliza los mismos helpers de accountIds en vez de
// duplicar la lógica de "dueño + compartidos" que ya vive en
// getUserAccountIds()/getUserChannelAccountIds() — se pregunta "¿esta cuenta
// está entre las cuentas de candidateUserId?" en vez de listar candidatos.
export async function canAssignToContact(
  contact: { accountId: string | null; channelAccountId: string | null; organizationId?: string | null },
  candidateUserId: string
): Promise<boolean> {
  // Contacto sin canal: solo un admin de su misma organización.
  if (!contact.accountId && !contact.channelAccountId && contact.organizationId) {
    const u = await prisma.user.findUnique({ where: { id: candidateUserId }, select: { role: true, organizationId: true, disabledAt: true } });
    return !!u && !u.disabledAt && u.role === "admin" && u.organizationId === contact.organizationId;
  }
  if (contact.accountId) {
    const ids = await getUserAccountIds(candidateUserId);
    return ids.includes(contact.accountId);
  }
  if (contact.channelAccountId) {
    const ids = await getUserChannelAccountIds(candidateUserId);
    return ids.includes(contact.channelAccountId);
  }
  return false;
}
