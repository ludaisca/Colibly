import { prisma } from "@/lib/prisma";
import { aiCreditLimit } from "@/lib/billing/state";
import { getOrgBilling, invalidateOrgBilling } from "@/lib/billing/gates";
import { notifyOrgAdmins } from "@/lib/billing/notify";
import { channelEntitlement, userEntitlement, type ChannelRef, type Entitlement } from "@/lib/billing/entitlements";
import { catalogMode, userAiCreditLimit } from "@/lib/billing/licenses";
import { appUrl, sendEmailSafely } from "@/lib/email/mailer";
import { billingNoticeTemplate } from "@/lib/email/templates";

// Créditos de IA: 1 crédito = 1 llamada a la IA (respuesta de bot, sugerencia,
// calificación, mensaje de recuperación, paso de IA de una automatización).
// Los embeddings de la base de conocimiento no cuentan. El periodo se
// reinicia con cada cobro de Stripe (invoice.paid) o, sin suscripción, al
// cumplirse un mes desde el último reinicio.
//
// Quién paga (regla 6 de docs/PLAN_LICENCIAS_2026-11-04.md):
//   · lo que pide una persona → sus créditos  ({ userId });
//   · lo automático sobre un chat → los del DUEÑO del canal ({ channel });
//   · un monitor → los de quien lo creó ({ userId }).
// Cada persona tiene los de su licencia (sin bolsa). Las organizaciones
// internas no tienen tope y las que conservan el catálogo anterior
// (`legacyUntil`) siguen con la bolsa de la organización.
//
// Se RESERVA el crédito antes de llamar a la IA con un incremento atómico con
// tope: dos llamadas simultáneas con 1 crédito libre no pasan las dos.

export type AiPayer = { userId: string } | { channel: ChannelRef };

export const AI_CREDITS_EXHAUSTED_MESSAGE = "Se acabaron tus créditos de IA de este mes.";

const ALERT_LEVELS = [80, 100] as const;

function monthAgo(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

// ── Bolsa de la organización (catálogo anterior) ──

async function rollOrgPeriodIfDue(organizationId: string, now: Date): Promise<void> {
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, aiCreditsPeriodStart: { lte: monthAgo(now) } },
    data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: now, aiCreditsAlertLevel: 0 },
  });
  if (count > 0) invalidateOrgBilling(organizationId);
}

async function orgLimit(organizationId: string): Promise<{ used: number; max: number } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, isInternal: true, status: true, seatQuantity: true, aiCreditsUsed: true, aiCreditsBonus: true },
  });
  return org ? { used: org.aiCreditsUsed, max: aiCreditLimit(org) } : null;
}

async function reserveOrgPool(organizationId: string, now: Date): Promise<boolean> {
  await rollOrgPeriodIfDue(organizationId, now);
  const l = await orgLimit(organizationId);
  if (!l) return false;
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, ...(Number.isFinite(l.max) ? { aiCreditsUsed: { lt: l.max } } : {}) },
    data: { aiCreditsUsed: { increment: 1 } },
  });
  invalidateOrgBilling(organizationId);
  if (count === 0) return false;
  if (Number.isFinite(l.max)) await alertOrgIfThreshold(organizationId, l.max);
  return true;
}

// ── Créditos personales (catálogo de licencias) ──

async function rollUserPeriodIfDue(userId: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, aiCreditsPeriodStart: { lte: monthAgo(now) } },
    data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: now, aiCreditsAlertLevel: 0 },
  });
}

async function userLimit(e: Entitlement, userId: string): Promise<{ used: number; max: number } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiCreditsUsed: true, aiCreditsBonus: true, disabledAt: true } });
  if (!user || user.disabledAt) return null;
  const max = userAiCreditLimit({ license: e.license, bonus: user.aiCreditsBonus, trialing: e.org.status === "TRIALING" });
  return { used: user.aiCreditsUsed, max };
}

/** Quién paga y con qué catálogo. null = nadie puede pagar (canal sin dueño activo, usuario inexistente). */
async function resolvePayer(payer: AiPayer): Promise<{ e: Entitlement; userId: string | null } | null> {
  const e = "userId" in payer ? await userEntitlement(payer.userId) : await channelEntitlement(payer.channel);
  if (!e) return null;
  if (e.mode !== "license") return { e, userId: null };
  if (!e.holder || e.holder.disabled) return null;
  return { e, userId: e.holder.id };
}

/**
 * Reserva un crédito para `payer`. false = agotado o sin licencia con IA: no
 * llamar a la IA.
 */
export async function reserveAiCredit(payer: AiPayer, now = new Date()): Promise<boolean> {
  const r = await resolvePayer(payer);
  if (!r) return false;
  if (r.e.mode === "internal") return true;
  if (r.e.mode === "legacy" || !r.userId) return reserveOrgPool(r.e.organizationId, now);
  const userId = r.userId;
  await rollUserPeriodIfDue(userId, now);
  const l = await userLimit(r.e, userId);
  if (!l || l.max <= 0) return false;
  const { count } = await prisma.user.updateMany({
    where: { id: userId, disabledAt: null, aiCreditsUsed: { lt: l.max } },
    data: { aiCreditsUsed: { increment: 1 } },
  });
  if (count === 0) return false;
  await alertUserIfThreshold(userId, l.max);
  return true;
}

/** ¿Le queda al menos un crédito a `payer`? Para cortar un lote antes de empezar (ticks). */
export async function hasAiCredits(payer: AiPayer, now = new Date()): Promise<boolean> {
  const status = await aiCreditStatus(payer, now);
  return !!status && status.used < status.max;
}

/** Usados y tope de quien pagaría (la bolsa en legacy; Infinity en internas). */
export async function aiCreditStatus(payer: AiPayer, now = new Date()): Promise<{ used: number; max: number } | null> {
  const r = await resolvePayer(payer);
  if (!r) return null;
  if (r.e.mode === "internal") return { used: 0, max: Infinity };
  if (r.e.mode === "legacy" || !r.userId) {
    await rollOrgPeriodIfDue(r.e.organizationId, now);
    return orgLimit(r.e.organizationId);
  }
  await rollUserPeriodIfDue(r.userId, now);
  return userLimit(r.e, r.userId);
}

/**
 * Resumen de la organización para las pantallas: en legacy, la bolsa; con
 * licencias, la suma de las personas activas (cada una gasta los suyos).
 */
export async function orgAiCreditSummary(organizationId: string, now = new Date()): Promise<{ used: number; limit: number; bonus: number } | null> {
  const org = await getOrgBilling(organizationId);
  if (!org) return null;
  const mode = catalogMode(org, now);
  if (mode !== "license") {
    const l = await orgLimit(organizationId);
    return l ? { used: l.used, limit: l.max, bonus: org.aiCreditsBonus } : null;
  }
  const users = await prisma.user.findMany({
    where: { organizationId, disabledAt: null },
    select: { license: true, aiCreditsUsed: true, aiCreditsBonus: true, aiCreditsPeriodStart: true },
  });
  const trialing = org.status === "TRIALING";
  const cutoff = monthAgo(now);
  let used = 0;
  let limit = 0;
  let bonus = 0;
  for (const u of users) {
    // Un periodo vencido que todavía no se reinició cuenta como 0.
    used += u.aiCreditsPeriodStart <= cutoff ? 0 : u.aiCreditsUsed;
    limit += userAiCreditLimit({ license: u.license, bonus: u.aiCreditsBonus, trialing });
    bonus += u.aiCreditsBonus;
  }
  return { used, limit, bonus };
}

// Nuevo periodo pagado (webhook invoice.paid de un ciclo o del alta): la
// bolsa de la organización y los créditos de cada persona.
export async function resetAiCredits(organizationId: string, at = new Date()): Promise<void> {
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: at, aiCreditsAlertLevel: 0 },
    }),
    prisma.user.updateMany({
      where: { organizationId },
      data: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: at, aiCreditsAlertLevel: 0 },
    }),
  ]);
  invalidateOrgBilling(organizationId);
}

// ── Avisos al cruzar 80 % y 100 %, una vez por periodo (reclamo atómico del nivel) ──

function levelFor(used: number, max: number) {
  const pct = (used / max) * 100;
  return [...ALERT_LEVELS].reverse().find((l) => pct >= l);
}

async function alertOrgIfThreshold(organizationId: string, max: number): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { aiCreditsUsed: true } });
  if (!org) return;
  const level = levelFor(org.aiCreditsUsed, max);
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

// /configuracion/plan es solo para admins; la persona va a su configuración.
const USER_CREDITS_LINK = "/configuracion";

// Aviso a la persona dueña de los créditos (campana; correo al 100 %).
async function alertUserIfThreshold(userId: string, max: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiCreditsUsed: true, email: true } });
  if (!user) return;
  const level = levelFor(user.aiCreditsUsed, max);
  if (!level) return;
  const { count } = await prisma.user.updateMany({
    where: { id: userId, aiCreditsAlertLevel: { lt: level } },
    data: { aiCreditsAlertLevel: level },
  });
  if (count === 0) return;
  const n = (v: number) => v.toLocaleString("es-MX");
  const notice =
    level === 100
      ? {
          title: "Se acabaron tus créditos de IA de este mes",
          paragraphs: [
            `Usaste tus ${n(max)} créditos de este periodo. Tus sugerencias y los bots de tus canales dejan de usar IA hasta el próximo periodo.`,
            "Un admin puede subir tu licencia en Usuarios para tener más créditos.",
          ],
        }
      : { title: "Usaste el 80 % de tus créditos de IA", paragraphs: [`Llevas ${n(user.aiCreditsUsed)} de ${n(max)} créditos este mes.`] };
  await prisma.notification.create({ data: { userId, type: "BILLING", title: notice.title, body: notice.paragraphs[0], link: USER_CREDITS_LINK } });
  if (level === 100) {
    await sendEmailSafely(
      billingNoticeTemplate({ to: user.email, title: notice.title, paragraphs: notice.paragraphs, ctaLabel: "Abrir Colibly", url: appUrl(USER_CREDITS_LINK) }),
      "créditos de IA agotados"
    );
  }
}
