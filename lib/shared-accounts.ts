import { prisma } from "@/lib/prisma";
import { getUserTenant } from "@/lib/tenancy";

// Cuentas de WhatsApp a las que el usuario tiene acceso. Toda consulta de
// datos de negocio (chats, contactos, campañas, estadísticas…) se acota con
// esto — más de 100 llamadas, por eso la firma no cambia con la tenencia.
//  - admin de la organización: todas las cuentas de SU organización.
//  - user / ejecutivo: las propias + las compartidas con él, y siempre dentro
//    de su organización (un share hacia otra organización no da acceso).
// R5 de docs/RENDIMIENTO_2026-11-04.md: el alcance se pide en casi cada
// request (y la bandeja sincroniza cada 5 s). Caché en memoria de 10 s, como
// la del tenant (lib/tenancy.ts, 60 s). Todo lo que crea, borra o comparte
// una cuenta llama a invalidateAccountScopes(); en otro proceso el cambio
// tarda como mucho el TTL (lo mismo que ya ocurre con un cambio de rol).
const SCOPE_TTL_MS = 10_000;
const scopeCache = new Map<string, { ids: string[]; loadedAt: number }>();

async function cachedScope(key: string, load: () => Promise<string[]>): Promise<string[]> {
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.loadedAt < SCOPE_TTL_MS) return hit.ids;
  const ids = await load();
  scopeCache.set(key, { ids, loadedAt: Date.now() });
  return ids;
}

/** Llamar tras crear/borrar una cuenta o una compartición (WhatsApp o canal). */
export function invalidateAccountScopes(): void {
  scopeCache.clear();
}

export async function getUserAccountIds(userId: string): Promise<string[]> {
  return cachedScope(`wa:${userId}`, () => loadUserAccountIds(userId));
}

async function loadUserAccountIds(userId: string): Promise<string[]> {
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
  return cachedScope(`ch:${userId}`, () => loadUserChannelAccountIds(userId));
}

async function loadUserChannelAccountIds(userId: string): Promise<string[]> {
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
