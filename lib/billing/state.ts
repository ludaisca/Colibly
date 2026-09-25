import type { OrganizationStatus, PlanId } from "@prisma/client";
import { GRACE_DAYS, PLANS, type PlanLimits } from "./plans";

// Reglas de facturación como funciones puras (sin Prisma ni Stripe): qué puede
// hacer una organización según su estado, qué aviso ver, cómo avanza el reloj y
// cómo se traduce una suscripción de Stripe. Todo lo demás (candados, webhook,
// tick, pantalla) se apoya aquí; los tests viven en __tests__/state.test.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingSnapshot {
  plan: PlanId;
  status: OrganizationStatus;
  isInternal: boolean;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

// full: todo funciona. read_only: se ve todo, pero no se envían mensajes ni
// corren bots/automatizaciones/campañas, y la UI no escribe. suspended: la
// plataforma lo bloqueó (tampoco entra).
export type AccessMode = "full" | "read_only" | "suspended";

// El estado guardado puede ir atrasado respecto al reloj (el tick corre cada
// hora): una prueba o una gracia vencida se tratan como solo lectura en el
// acto, sin esperar al tick.
export function accessMode(org: BillingSnapshot, now: Date): AccessMode {
  if (org.status === "SUSPENDED") return "suspended";
  if (org.isInternal) return "full";
  switch (org.status) {
    case "ACTIVE":
      return "full";
    case "TRIALING":
      return org.trialEndsAt && org.trialEndsAt > now ? "full" : "read_only";
    case "PAST_DUE":
      return org.graceEndsAt && org.graceEndsAt > now ? "full" : "read_only";
    default:
      return "read_only";
  }
}

const UNLIMITED: PlanLimits = {
  users: Infinity,
  channels: Infinity,
  contacts: Infinity,
  aiCreditsPerMonth: Infinity,
  activeAutomations: Infinity,
  apiAccess: true,
};

// Límites vigentes: los del plan; las organizaciones internas no tienen tope.
export function planLimits(org: Pick<BillingSnapshot, "plan" | "isInternal">): PlanLimits {
  return org.isInternal ? UNLIMITED : PLANS[org.plan].limits;
}

export type NoticeKind = "trial_ending" | "trial_expired" | "past_due" | "read_only" | "canceled" | "canceling";

export interface BillingNotice {
  kind: NoticeKind;
  tone: "info" | "warning" | "danger";
  daysLeft?: number;
  date?: Date;
}

// Días completos que faltan, redondeando hacia arriba (queda "1 día" hasta el
// último instante).
export function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

export const TRIAL_ENDING_NOTICE_DAYS = 3;

// El aviso superior que corresponde (o null si no hay nada que decir).
export function billingNotice(org: BillingSnapshot, now: Date): BillingNotice | null {
  if (org.isInternal || org.status === "SUSPENDED") return null;
  const mode = accessMode(org, now);
  if (org.status === "TRIALING") {
    if (mode === "read_only") return { kind: "trial_expired", tone: "danger" };
    const daysLeft = org.trialEndsAt ? daysUntil(org.trialEndsAt, now) : 0;
    return daysLeft <= TRIAL_ENDING_NOTICE_DAYS
      ? { kind: "trial_ending", tone: "warning", daysLeft, date: org.trialEndsAt ?? undefined }
      : { kind: "trial_ending", tone: "info", daysLeft, date: org.trialEndsAt ?? undefined };
  }
  if (org.status === "PAST_DUE") {
    if (mode === "read_only") return { kind: "read_only", tone: "danger" };
    return { kind: "past_due", tone: "danger", daysLeft: org.graceEndsAt ? daysUntil(org.graceEndsAt, now) : 0, date: org.graceEndsAt ?? undefined };
  }
  if (org.status === "READ_ONLY") return { kind: "read_only", tone: "danger" };
  if (org.status === "CANCELED") return { kind: "canceled", tone: "danger" };
  if (org.status === "ACTIVE" && org.cancelAtPeriodEnd && org.currentPeriodEnd) {
    return { kind: "canceling", tone: "warning", date: org.currentPeriodEnd, daysLeft: daysUntil(org.currentPeriodEnd, now) };
  }
  return null;
}

// Transición del tick horario: prueba vencida o gracia vencida → solo lectura.
export function tickTransition(org: BillingSnapshot, now: Date): OrganizationStatus | null {
  if (org.isInternal) return null;
  if (org.status === "TRIALING" && (!org.trialEndsAt || org.trialEndsAt <= now)) return "READ_ONLY";
  if (org.status === "PAST_DUE" && (!org.graceEndsAt || org.graceEndsAt <= now)) return "READ_ONLY";
  return null;
}

// ── Stripe ──

export interface SubscriptionSnapshot {
  status: string; // Stripe.Subscription.Status
  priceId: string | null;
  currentPeriodEnd: number | null; // unix (segundos)
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionUpdate {
  plan?: PlanId;
  status?: OrganizationStatus;
  graceEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
}

// Traduce el estado ACTUAL de la suscripción (el webhook siempre la vuelve a
// leer de Stripe, así que el orden de llegada de los eventos no importa) a los
// campos de la organización.
export function deriveFromSubscription(
  sub: SubscriptionSnapshot,
  org: { status: OrganizationStatus; graceEndsAt: Date | null; canceledAt: Date | null },
  now: Date,
  planForPrice: (priceId: string) => PlanId | null
): SubscriptionUpdate {
  const update: SubscriptionUpdate = {
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : null,
  };
  const plan = sub.priceId ? planForPrice(sub.priceId) : null;
  if (plan) update.plan = plan;

  switch (sub.status) {
    case "active":
    case "trialing":
      update.status = "ACTIVE";
      update.graceEndsAt = null;
      update.canceledAt = null;
      break;
    case "past_due":
    case "unpaid": {
      const grace = org.graceEndsAt ?? new Date(now.getTime() + GRACE_DAYS * DAY_MS);
      update.graceEndsAt = grace;
      update.status = grace > now ? "PAST_DUE" : "READ_ONLY";
      break;
    }
    case "canceled":
    case "incomplete_expired":
      update.status = "CANCELED";
      update.canceledAt = org.canceledAt ?? now;
      update.cancelAtPeriodEnd = false;
      break;
    case "paused":
      update.status = "READ_ONLY";
      break;
    default:
      // incomplete: el primer pago aún no se confirma; la organización sigue
      // como estaba (en prueba o solo lectura).
      break;
  }
  // Una suscripción que Stripe ya no cobra no deja la organización suspendida
  // por la plataforma en otro estado: SUSPENDED solo lo quita un superadmin.
  if (org.status === "SUSPENDED") delete update.status;
  return update;
}
