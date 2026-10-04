import { prisma } from "@/lib/prisma";
import { aiCreditLimit } from "@/lib/billing/state";
import { invalidateOrgBilling } from "@/lib/billing/gates";
import { notifyOrgAdmins } from "@/lib/billing/notify";
import { requireOrgId } from "@/lib/tenancy";

// Créditos de IA: 1 crédito = 1 llamada a la IA (respuesta de bot, sugerencia,
// calificación, mensaje de recuperación, paso de IA de una automatización).
// Los embeddings de la base de conocimiento no cuentan. El periodo se
// reinicia con cada cobro de Stripe (invoice.paid) o, sin suscripción, al
// cumplirse un mes desde el último reinicio.
//
// Se RESERVA el crédito antes de llamar a la IA con un incremento atómico con
// tope: dos llamadas simultáneas con 1 crédito libre no pasan las dos.

const ALERT_LEVELS = [80, 100] as const;

function monthAgo(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

async function rollPeriodIfDue(organizationId: string, now: Date): Promise<void> {
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, aiCreditsPeriodStart: { lte: monthAgo(now) } },
    data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: now, aiCreditsAlertLevel: 0 },
  });
  if (count > 0) invalidateOrgBilling(organizationId);
}

// Nuevo periodo pagado (webhook invoice.paid de un ciclo o del alta).
export async function resetAiCredits(organizationId: string, at = new Date()): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: at, aiCreditsAlertLevel: 0 },
  });
  invalidateOrgBilling(organizationId);
}

async function limitFor(organizationId: string): Promise<{ used: number; max: number } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, isInternal: true, aiCreditsUsed: true, aiCreditsBonus: true },
  });
  return org ? { used: org.aiCreditsUsed, max: aiCreditLimit(org) } : null;
}

// ¿Queda al menos un crédito? Para cortar un lote antes de empezar (ticks).
export async function hasAiCredits(organizationId: string, now = new Date()): Promise<boolean> {
  await rollPeriodIfDue(organizationId, now);
  const l = await limitFor(organizationId);
  return !!l && l.used < l.max;
}

// Reserva un crédito. false = agotado: no llamar a la IA.
export async function reserveAiCredit(organizationId: string, now = new Date()): Promise<boolean> {
  await rollPeriodIfDue(organizationId, now);
  const l = await limitFor(organizationId);
  if (!l) return false;
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, ...(Number.isFinite(l.max) ? { aiCreditsUsed: { lt: l.max } } : {}) },
    data: { aiCreditsUsed: { increment: 1 } },
  });
  invalidateOrgBilling(organizationId);
  if (count === 0) return false;
  if (Number.isFinite(l.max)) await alertIfThreshold(organizationId, l.max);
  return true;
}

export async function reserveAiCreditForUser(userId: string): Promise<boolean> {
  return reserveAiCredit(await requireOrgId(userId));
}

export async function hasAiCreditsForUser(userId: string): Promise<boolean> {
  return hasAiCredits(await requireOrgId(userId));
}

// Aviso al cruzar 80 % y 100 %, una vez por periodo (reclamo atómico del nivel).
async function alertIfThreshold(organizationId: string, max: number): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { aiCreditsUsed: true } });
  if (!org) return;
  const pct = (org.aiCreditsUsed / max) * 100;
  const level = [...ALERT_LEVELS].reverse().find((l) => pct >= l);
  if (!level) return;
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, aiCreditsAlertLevel: { lt: level } },
    data: { aiCreditsAlertLevel: level },
  });
  if (count === 0) return;
  await notifyOrgAdmins(
    organizationId,
    level === 100
      ? {
          title: "Se acabaron tus créditos de IA de este mes",
          paragraphs: [
            `Usaste los ${max.toLocaleString("es-MX")} créditos de este periodo. Los bots dejan de responder y los pasos de IA de tus automatizaciones toman la rama "otro" hasta el próximo periodo.`,
            "Mejora tu plan para tener más créditos.",
          ],
          email: true,
        }
      : {
          title: "Usaste el 80 % de tus créditos de IA",
          paragraphs: [`Llevas ${org.aiCreditsUsed.toLocaleString("es-MX")} de ${max.toLocaleString("es-MX")} créditos este mes.`],
          email: false,
        }
  );
}
