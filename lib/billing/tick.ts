import { prisma } from "@/lib/prisma";
import { daysUntil, planLimits, tickTransition, TRIAL_ENDING_NOTICE_DAYS } from "./state";
import { getOrgUsage, invalidateOrgBilling } from "./gates";
import { contactLimitNotice, notifyBillingTransition, notifyOrgAdmins, trialEndingNotice } from "./notify";

// Tick horario de facturación (cola billing-tick):
//  1. prueba vencida o gracia vencida → READ_ONLY (con aviso);
//  2. aviso "tu prueba termina en N días" (una vez por día restante ≤ 3);
//  3. aviso de límite de contactos alcanzado (una vez por mes).
// lastBillingNotice guarda la clave del último aviso para no repetirlo.

export async function processBillingTick(now = new Date()): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { isInternal: false, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
    select: {
      id: true,
      plan: true,
      status: true,
      isInternal: true,
      trialEndsAt: true,
      graceEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      lastBillingNotice: true,
    },
  });

  for (const org of orgs) {
    try {
      const next = tickTransition(org, now);
      if (next) {
        const { count } = await prisma.organization.updateMany({ where: { id: org.id, status: org.status }, data: { status: next } });
        invalidateOrgBilling(org.id);
        if (count > 0) await notifyBillingTransition(org.id, org.status, next);
        continue;
      }

      if (org.status === "TRIALING" && org.trialEndsAt) {
        const daysLeft = daysUntil(org.trialEndsAt, now);
        const key = `trial_ending:${daysLeft}`;
        if (daysLeft <= TRIAL_ENDING_NOTICE_DAYS && org.lastBillingNotice !== key && (await claimNotice(org.id, org.lastBillingNotice, key))) {
          await notifyOrgAdmins(org.id, trialEndingNotice(daysLeft));
        }
      }

      const maxContacts = planLimits(org).contacts;
      if (maxContacts !== Infinity) {
        const key = `contacts_full:${now.toISOString().slice(0, 7)}`;
        if (org.lastBillingNotice !== key && (await getOrgUsage(org.id)).contacts >= maxContacts && (await claimNotice(org.id, org.lastBillingNotice, key))) {
          await notifyOrgAdmins(org.id, contactLimitNotice(maxContacts));
        }
      }
    } catch (err) {
      console.error(`[billing-tick] Organización ${org.id}:`, err);
    }
  }
}

// Reclamo atómico del aviso: con dos procesos corriendo el tick, solo uno lo envía.
async function claimNotice(organizationId: string, previous: string | null, key: string): Promise<boolean> {
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, lastBillingNotice: previous },
    data: { lastBillingNotice: key },
  });
  return count === 1;
}
