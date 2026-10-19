import { prisma } from "@/lib/prisma";
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
      // Coexistencia es la función principal: toda organización nueva nace con
      // ella (explícito, aunque coincide con el default del schema).
      whatsappCoexistenceEnabled: true,
    },
  });
  const owner = await tx.user.create({
    data: { name: input.name, email: input.email, password: input.hashedPassword, role: "admin", organizationId: organization.id },
  });
  await tx.organization.update({ where: { id: organization.id }, data: { ownerId: owner.id } });
  return { organization, owner };
}

export interface BusinessHours {
  timezone: string;
  startHour: number;
  endHour: number;
}

// Horario laboral y zona horaria de la organización (recuperación de leads,
// importación de hojas, citas del bot, condición "en horario" de las
// automatizaciones).
export async function getOrgBusinessHours(organizationId: string): Promise<BusinessHours> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, businessHourStart: true, businessHourEnd: true },
  });
  return {
    timezone: org?.timezone ?? "America/Mexico_City",
    startHour: org?.businessHourStart ?? 8,
    endHour: org?.businessHourEnd ?? 20,
  };
}
