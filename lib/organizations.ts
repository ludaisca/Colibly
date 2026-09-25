import { Prisma } from "@prisma/client";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/lib/billing/plans";

// Alta de un cliente nuevo (SaaS): la organización nace en prueba (plan Pro,
// TRIAL_DAYS días, sin tarjeta) y su primer usuario es admin y DUEÑO — el
// dueño no se puede degradar ni desactivar (reemplaza a la vieja regla del
// "primer usuario registrado del sistema"). Recibe el cliente de la
// transacción: el llamador decide el aislamiento (Serializable, ver registro).
export async function createOrganizationWithOwner(
  tx: Prisma.TransactionClient,
  input: { businessName: string; name: string; email: string; hashedPassword: string }
) {
  const organization = await tx.organization.create({
    data: {
      name: input.businessName,
      plan: TRIAL_PLAN,
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const owner = await tx.user.create({
    data: { name: input.name, email: input.email, password: input.hashedPassword, role: "admin", organizationId: organization.id },
  });
  await tx.organization.update({ where: { id: organization.id }, data: { ownerId: owner.id } });
  return { organization, owner };
}
