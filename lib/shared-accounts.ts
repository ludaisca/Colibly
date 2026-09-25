import { prisma } from "@/lib/prisma";
import { getUserTenant } from "@/lib/tenancy";

// Cuentas de WhatsApp a las que el usuario tiene acceso. Toda consulta de
// datos de negocio (chats, contactos, campañas, estadísticas…) se acota con
// esto — más de 100 llamadas, por eso la firma no cambia con la tenencia.
//  - admin de la organización: todas las cuentas de SU organización.
//  - user / ejecutivo: las propias + las compartidas con él, y siempre dentro
//    de su organización (un share hacia otra organización no da acceso).
export async function getUserAccountIds(userId: string): Promise<string[]> {
  const tenant = await getUserTenant(userId);
  if (!tenant) return [];
  if (tenant.role === "admin") {
    const accounts = await prisma.wAAccount.findMany({ where: { organizationId: tenant.organizationId }, select: { id: true } });
    return accounts.map((a) => a.id);
  }

  const [ownAccounts, shared] = await Promise.all([
    prisma.wAAccount.findMany({
      where: { userId, organizationId: tenant.organizationId },
      select: { id: true },
    }),
    prisma.wAAccountShare.findMany({
      where: { userId, waAccount: { organizationId: tenant.organizationId } },
      select: { waAccountId: true },
    }),
  ]);

  const directIds = ownAccounts.map((a) => a.id);
  const sharedIds = shared.map((s) => s.waAccountId);
  return [...new Set([...directIds, ...sharedIds])];
}

// Equivalente a getUserAccountIds() para cuentas de canal (Telegram,
// Messenger, Instagram, Web) — misma regla de admin / propias + compartidas.
export async function getUserChannelAccountIds(userId: string): Promise<string[]> {
  const tenant = await getUserTenant(userId);
  if (!tenant) return [];
  if (tenant.role === "admin") {
    const accounts = await prisma.channelAccount.findMany({ where: { organizationId: tenant.organizationId }, select: { id: true } });
    return accounts.map((a) => a.id);
  }

  const [ownAccounts, shared] = await Promise.all([
    prisma.channelAccount.findMany({
      where: { userId, organizationId: tenant.organizationId },
      select: { id: true },
    }),
    prisma.channelAccountShare.findMany({
      where: { userId, channelAccount: { organizationId: tenant.organizationId } },
      select: { channelAccountId: true },
    }),
  ]);

  const directIds = ownAccounts.map((a) => a.id);
  const sharedIds = shared.map((s) => s.channelAccountId);
  return [...new Set([...directIds, ...sharedIds])];
}
