import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";

// Alcance de los contactos de una persona: los de sus cuentas de WhatsApp y de
// sus canales genéricos, más —solo para el admin— los contactos "sin canal"
// de su organización (los que se crean a mano o por CSV antes de conectar
// WhatsApp: accountId y channelAccountId null, con organizationId). Todo lugar
// que arme el alcance de contactos a mano debe pasar por aquí.

export interface ContactScopeInput {
  accountIds: string[];
  channelAccountIds: string[];
  organizationId: string | null;
  isAdmin: boolean;
}

export type ContactScopeWhere = { OR: Record<string, unknown>[] };

/** Condición de Prisma para `contact.findMany({ where })` (pura, para pruebas). */
export function buildContactScope(input: ContactScopeInput): ContactScopeWhere {
  const OR: Record<string, unknown>[] = [{ accountId: { in: input.accountIds } }, { channelAccountId: { in: input.channelAccountIds } }];
  if (input.isAdmin && input.organizationId) OR.push({ accountId: null, channelAccountId: null, organizationId: input.organizationId });
  return { OR };
}

export async function contactScopeInput(userId: string): Promise<ContactScopeInput> {
  const [accountIds, channelAccountIds, user] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true } }),
  ]);
  return { accountIds, channelAccountIds, organizationId: user?.organizationId ?? null, isAdmin: user?.role === "admin" };
}

export async function contactScopeWhere(userId: string): Promise<ContactScopeWhere> {
  return buildContactScope(await contactScopeInput(userId));
}

/** ¿Es un contacto sin canal? (no cuelga de ninguna cuenta) */
export function isChannellessContact(c: { accountId?: string | null; channelAccountId?: string | null }): boolean {
  return !c.accountId && !c.channelAccountId;
}
