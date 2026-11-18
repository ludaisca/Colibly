import { prisma } from "@/lib/prisma";

// Tenencia (SaaS): cada usuario pertenece a UNA organización y su `role`
// (admin/user/ejecutivo) es el rol dentro de ella. Todo recurso de negocio
// cuelga de una organización — las entidades de primer nivel llevan
// organizationId; chats, contactos, mensajes y etiquetas la heredan de su
// cuenta. Nunca filtrar recursos de negocio por creador (userId): dos admins
// del mismo espacio deben ver lo mismo, y un usuario de otra organización nada.

export interface Tenant {
  organizationId: string;
  role: string;
}

// Caché en memoria como el de la sesión (lib/auth.ts): el rol y la
// organización se leen en casi cada request vía getUserAccountIds().
const TENANT_TTL_MS = 60_000;
const tenantCache = new Map<string, { tenant: Tenant | null; loadedAt: number }>();

export async function getUserTenant(userId: string): Promise<Tenant | null> {
  const cached = tenantCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < TENANT_TTL_MS) return cached.tenant;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, role: true, disabledAt: true },
  });
  const tenant = user && !user.disabledAt ? { organizationId: user.organizationId, role: user.role } : null;
  tenantCache.set(userId, { tenant, loadedAt: Date.now() });
  return tenant;
}

export function invalidateTenantCache(userId: string) {
  tenantCache.delete(userId);
}

// Para rutas que ya validaron la sesión: la organización del usuario, o
// lanza (un usuario sin organización no debería existir tras la migración).
export async function requireOrgId(userId: string): Promise<string> {
  const tenant = await getUserTenant(userId);
  if (!tenant) throw new Error("El usuario no pertenece a ninguna organización");
  return tenant.organizationId;
}

// `where` para recursos que administra la organización (bots, calificadores,
// Meta Ads, API keys, webhooks): cualquier admin del espacio los ve y edita,
// no solo quien los creó.
export async function orgWhere(userId: string): Promise<{ organizationId: string }> {
  return { organizationId: await requireOrgId(userId) };
}

// `where` para ADMINISTRAR una cuenta (editar, borrar, compartir, reglas):
// cualquier admin de su organización, o su dueño. Antes era solo el dueño —
// con varios admins por espacio eso dejaba cuentas sin quién las administre.
export async function accountManageWhere(userId: string): Promise<{ organizationId: string; userId?: string }> {
  const tenant = await getUserTenant(userId);
  if (!tenant) throw new Error("El usuario no pertenece a ninguna organización");
  return tenant.role === "admin" ? { organizationId: tenant.organizationId } : { organizationId: tenant.organizationId, userId };
}
