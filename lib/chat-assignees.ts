import { prisma } from "@/lib/prisma";

export interface Assignee {
  id: string;
  name: string | null;
  email: string;
}

export async function getEligibleAssignees(accountId: string): Promise<Assignee[]> {
  const account = await prisma.wAAccount.findUnique({
    where: { id: accountId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  const shares = await prisma.wAAccountShare.findMany({
    where: { waAccountId: accountId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  const assignees: Assignee[] = [];
  if (account?.user) assignees.push(account.user);
  for (const share of shares) {
    if (!assignees.some((a) => a.id === share.user.id)) {
      assignees.push(share.user);
    }
  }
  return assignees;
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

  if (contact.channelAccountId) {
    const account = await prisma.channelAccount.findUnique({
      where: { id: contact.channelAccountId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    const shares = await prisma.channelAccountShare.findMany({
      where: { channelAccountId: contact.channelAccountId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    const assignees: Assignee[] = [];
    if (account?.user) assignees.push(account.user);
    for (const share of shares) {
      if (!assignees.some((a) => a.id === share.user.id)) {
        assignees.push(share.user);
      }
    }
    return assignees;
  }

  return [];
}
