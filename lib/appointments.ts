import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Compartido por las rutas de /api/whatsapp/appointments (lista+creación y
// detalle) — una Cita cuelga de un Contact, y Contact ya puede venir de
// WhatsApp (accountId) o de un canal genérico (channelAccountId), así que
// el alcance de "qué citas puede ver/tocar este usuario" es siempre el mismo
// filtro de dos mundos que ya usa GET /api/whatsapp/contacts y
// GET /api/whatsapp/lead-scores.
export async function getContactScopeIds(userId: string): Promise<{ accountIds: string[]; channelAccountIds: string[] }> {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);
  return { accountIds, channelAccountIds };
}

// ¿Puede asignarse una cita a `candidateUserId` dado que pertenece a la
// cuenta de `contact`? Reutiliza los mismos helpers de accountIds en vez de
// duplicar la lógica de "dueño + compartidos" que ya vive en
// getUserAccountIds()/getUserChannelAccountIds() — se pregunta "¿esta cuenta
// está entre las cuentas de candidateUserId?" en vez de listar candidatos.
export async function canAssignToContact(
  contact: { accountId: string | null; channelAccountId: string | null },
  candidateUserId: string
): Promise<boolean> {
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
