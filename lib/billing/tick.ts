import { checkContactAlerts, reconcileOverLimit } from "./contact-limits";
import { prisma } from "@/lib/prisma";
import { daysUntil, PAST_DUE_REMINDER_DAYS, planLimits, purgeDue, tickTransition, TRIAL_REMINDER_DAYS } from "./state";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "./plans";
import { deleteOrganizationData } from "@/lib/org-data/delete";
import { invalidateOrgBilling } from "./gates";
import { notifyBillingTransition, notifyOrgAdmins, pastDueReminderNotice, trialEndingNotice } from "./notify";

// Tick horario de facturación (cola billing-tick):
//  1. prueba vencida o gracia vencida → READ_ONLY (con aviso);
//  2. aviso "tu prueba termina en N días" (7, 3 y 1) y, con un pago fallido,
//     "tu cuenta pasa a solo lectura en N días" (3 y 1);
//  3. contactos: overLimit más allá del 120 % y avisos de 80/100/120 % (una vez por umbral y periodo);
//  4. purga de organizaciones canceladas o con la prueba vencida sin pago
//     (purgeDue en state.ts).
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
      seatQuantity: true,
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
        if (TRIAL_REMINDER_DAYS.includes(daysLeft) && org.lastBillingNotice !== key && (await claimNotice(org.id, org.lastBillingNotice, key))) {
          await notifyOrgAdmins(org.id, trialEndingNotice(daysLeft));
        }
      }

      if (org.status === "PAST_DUE" && org.graceEndsAt) {
        const daysLeft = daysUntil(org.graceEndsAt, now);
        const key = `past_due:${daysLeft}`;
        if (PAST_DUE_REMINDER_DAYS.includes(daysLeft) && org.lastBillingNotice !== key && (await claimNotice(org.id, org.lastBillingNotice, key))) {
          await notifyOrgAdmins(org.id, pastDueReminderNotice(daysLeft));
        }
      }

      // Contactos: recalcula quién está más allá del 120 % y avisa 80/100/120 %.
      if (planLimits(org).contacts !== Infinity) {
        const usage = await reconcileOverLimit(org.id);
        await checkContactAlerts(org.id, usage, now);
      }
    } catch (err) {
      console.error(`[billing-tick] Organización ${org.id}:`, err);
    }
  }

  await purgeExpiredOrganizations(now);
}

// Pocas por tick: cada borrado recorre toda la base de la organización.
const PURGE_BATCH = 5;

async function purgeExpiredOrganizations(now: Date): Promise<void> {
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  // La consulta preselecciona; purgeDue() es la regla (y se vuelve a evaluar
  // justo antes de borrar, dentro de deleteOrganizationData).
  const due = await prisma.organization.findMany({
    where: {
      isInternal: false,
      OR: [
        { status: "CANCELED", canceledAt: { lte: daysAgo(RETENTION_DAYS_AFTER_CANCEL) } },
        { status: "READ_ONLY", stripeSubscriptionId: null, trialEndsAt: { lte: daysAgo(RETENTION_DAYS_AFTER_TRIAL) } },
      ],
    },
    select: { id: true, status: true, isInternal: true, canceledAt: true, trialEndsAt: true, stripeSubscriptionId: true },
    orderBy: { updatedAt: "asc" },
    take: PURGE_BATCH,
  });
  for (const org of due.filter((o) => purgeDue(o, now))) {
    try {
      const result = await deleteOrganizationData(org.id, { onlyIfPurgeDue: now });
      if (result) {
        const why = org.status === "CANCELED" ? `cancelada el ${org.canceledAt?.toISOString()}` : `prueba vencida el ${org.trialEndsAt?.toISOString()}`;
        console.log(`[billing-tick] Purgada la organización ${org.id} (${why})`);
      }
    } catch (err) {
      console.error(`[billing-tick] No se pudo purgar la organización ${org.id}:`, err);
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
