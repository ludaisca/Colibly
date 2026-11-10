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

const USER_SELECT = { select: { id: true, name: true, email: true, disabledAt: true } } as const;

// Los admins de la organización ven todas sus cuentas (lib/shared-accounts.ts),
// así que también pueden recibir chats de cualquiera de ellas.
function orgAdmins(organizationId: string | undefined) {
  if (!organizationId) return Promise.resolve([]);
  return prisma.user.findMany({
    where: { organizationId, role: "admin" },
    select: USER_SELECT.select,
    orderBy: { createdAt: "asc" },
  });
}

export async function getEligibleAssignees(accountId: string): Promise<Assignee[]> {
  const [account, shares] = await Promise.all([
    prisma.wAAccount.findUnique({ where: { id: accountId }, select: { organizationId: true, user: USER_SELECT } }),
    prisma.wAAccountShare.findMany({ where: { waAccountId: accountId }, select: { user: USER_SELECT } }),
  ]);
  const admins = await orgAdmins(account?.organizationId);
  return toActiveAssignees([account?.user, ...shares.map((s) => s.user), ...admins]);
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
  organizationId?: string | null;
}): Promise<Assignee[]> {
  if (contact.accountId) return getEligibleAssignees(contact.accountId);

  if (contact.channelAccountId) return getEligibleChannelAssignees(contact.channelAccountId);

  // Contacto sin canal: lo atienden los admins de su organización.
  if (contact.organizationId) return toActiveAssignees(await orgAdmins(contact.organizationId));

  return [];
}

// Equivalente de getEligibleAssignees() para ChannelAccount (Telegram,
// Messenger, Instagram, Web): dueño + usuarios con ChannelAccountShare +
// admins de la organización, sin desactivados.
export async function getEligibleChannelAssignees(channelAccountId: string): Promise<Assignee[]> {
  const [account, shares] = await Promise.all([
    prisma.channelAccount.findUnique({ where: { id: channelAccountId }, select: { organizationId: true, user: USER_SELECT } }),
    prisma.channelAccountShare.findMany({ where: { channelAccountId }, select: { user: USER_SELECT } }),
  ]);
  const admins = await orgAdmins(account?.organizationId);
  return toActiveAssignees([account?.user, ...shares.map((s) => s.user), ...admins]);
}
