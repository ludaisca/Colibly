import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/lib/billing/plans";
import { TRIAL_LICENSE } from "@/lib/billing/licenses";
import { createDefaultPipeline } from "@/lib/pipeline/ensure";

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
      // Canales disponibles desde el alta: el usuario los conecta con sus
      // credenciales. El plan sigue limitando cuántos puede usar.
      channelTelegramEnabled: true,
      channelMessengerEnabled: true,
      channelInstagramEnabled: true,
      channelWebchatEnabled: true,
    },
  });
  const owner = await tx.user.create({
    // La organización nace en prueba: el dueño entra con la licencia de la prueba.
    data: { name: input.name, email: input.email, password: input.hashedPassword, role: "admin", organizationId: organization.id, license: TRIAL_LICENSE },
  });
  await tx.organization.update({ where: { id: organization.id }, data: { ownerId: owner.id } });
  await createDefaultPipeline(tx, organization.id);
  return { organization, owner };
}

export interface BusinessHours {
  timezone: string;
  startHour: number;
  endHour: number;
  /** Días hábiles, 0 = domingo … 6 = sábado. */
  days: number[];
}

// Horario laboral y zona horaria de la organización (recuperación de leads,
// importación de hojas, citas del bot, condición "en horario" de las
// automatizaciones).
export async function getOrgBusinessHours(organizationId: string): Promise<BusinessHours> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, businessHourStart: true, businessHourEnd: true, businessDays: true },
  });
  return {
    timezone: org?.timezone ?? "America/Mexico_City",
    startHour: org?.businessHourStart ?? 8,
    endHour: org?.businessHourEnd ?? 20,
    days: org?.businessDays?.length ? org.businessDays : [0, 1, 2, 3, 4, 5, 6],
  };
}
