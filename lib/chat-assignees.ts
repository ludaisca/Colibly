import { prisma } from "@/lib/prisma";

export interface Assignee {
  id: string;
  name: string | null;
  email: string;
}

// Sin duplicados y sin usuarios desactivados — un agente dado de baja no debe
// recibir chats, citas ni reglas de enrutamiento.
function toActiveAssignees(
  users: Array<{ id: string; name: string | null; email: string; disabledAt: Date | null } | null | undefined>
): Assignee[] {
  const assignees: Assignee[] = [];
  for (const u of users) {
    if (!u || u.disabledAt || assignees.some((a) => a.id === u.id)) continue;
    assignees.push({ id: u.id, name: u.name, email: u.email });
  }
  return assignees;
}

export async function getEligibleAssignees(accountId: string): Promise<Assignee[]> {
  const account = await prisma.wAAccount.findUnique({
    where: { id: accountId },
    select: { user: { select: { id: true, name: true, email: true, disabledAt: true } } },
  });

  const shares = await prisma.wAAccountShare.findMany({
    where: { waAccountId: accountId },
    select: { user: { select: { id: true, name: true, email: true, disabledAt: true } } },
  });

  return toActiveAssignees([account?.user, ...shares.map((s) => s.user)]);
}

// Generalización de getEligibleAssignees() para Contact, que puede colgar de
// WAAccount o de ChannelAccount — usada por el picker de "Asignar a" de
// Citas (una cita se asigna a un usuario con acceso a la cuenta del
// contacto, mismo criterio de elegibilidad que ya aplica a chats). No
// reemplaza getEligibleAssignees(accountId): esa firma la siguen llamando
// 3 sitios que ya conocen su WAAccount de antemano, sin pasar por un Contact.
export async function getEligibleAssigneesForContact(contact: {
  accountId: string | null;
  channelAccountId: string | null;
}): Promise<Assignee[]> {
  if (contact.accountId) return getEligibleAssignees(contact.accountId);

  if (contact.channelAccountId) return getEligibleChannelAssignees(contact.channelAccountId);

  return [];
}

// Equivalente de getEligibleAssignees() para ChannelAccount (Telegram,
// Messenger, Instagram, Web): dueño + usuarios con ChannelAccountShare, sin
// desactivados.
export async function getEligibleChannelAssignees(channelAccountId: string): Promise<Assignee[]> {
  const [account, shares] = await Promise.all([
    prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
      select: { user: { select: { id: true, name: true, email: true, disabledAt: true } } },
    }),
    prisma.channelAccountShare.findMany({
      where: { channelAccountId },
      select: { user: { select: { id: true, name: true, email: true, disabledAt: true } } },
    }),
  ]);
  return toActiveAssignees([account?.user, ...shares.map((s) => s.user)]);
}
