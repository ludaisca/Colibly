import { getUserTenant } from "@/lib/tenancy";
import { CrmError, forbidden } from "@/lib/crm/errors";

export type CrmRole = "admin" | "user" | "ejecutivo";

export interface CrmActor {
  userId: string;
  organizationId: string;
  role: CrmRole;
}

// Sesión → actor del CRM (usuario, organización y rol vigentes). El alcance de
// TODO lo que toca el CRM es `organizationId`: nunca se filtra por creador.
export async function getActor(): Promise<CrmActor> {
  // Import perezoso: este módulo también lo cargan servicios que corren fuera
  // de una petición (workers, ingestas) y no deben arrastrar NextAuth.
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.id) throw new CrmError(401, "unauthorized", "No autorizado");
  const tenant = await getUserTenant(session.user.id);
  if (!tenant) throw new CrmError(401, "unauthorized", "No autorizado");
  return { userId: session.user.id, organizationId: tenant.organizationId, role: tenant.role as CrmRole };
}

// `ejecutivo` es el rol acotado: comparte el directorio pero solo edita lo que
// tiene asignado. `admin` y `user` ven y editan todo lo de su organización.
export const isRestricted = (actor: CrmActor) => actor.role === "ejecutivo";

export function requireRoles(actor: CrmActor, roles: readonly CrmRole[]): void {
  if (!roles.includes(actor.role)) throw forbidden();
}

// ¿Puede editar este registro (persona/empresa)? Los ejecutivos, solo si son
// su responsable.
export function assertCanEdit(actor: CrmActor, record: { ownerId: string | null }): void {
  if (isRestricted(actor) && record.ownerId !== actor.userId) {
    throw forbidden("Solo puedes editar los registros que tienes asignados");
  }
}
