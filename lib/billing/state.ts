import type { OrganizationStatus, PlanId } from "@prisma/client";
import { GRACE_DAYS, limitsForSeats, MIN_SEATS, PLANS, SEAT_CHANNEL_LABELS, SEAT_CHANNELS, RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL, TRIAL_MAX_SEATS, type PlanLimits } from "./plans";

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
  // Asientos cobrados (quantity de Stripe). Ver seatCap().
  seatQuantity: number;
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
  seats: Infinity,
  whatsapp: Infinity,
  telegram: Infinity,
  messenger: Infinity,
  instagram: Infinity,
  contacts: Infinity,
  aiCreditsPerMonth: Infinity,
  activeAutomations: Infinity,
  apiAccess: true,
  aiAccess: true,
  webchat: true,
};

export type SeatSnapshot = Pick<BillingSnapshot, "plan" | "isInternal" | "status" | "seatQuantity">;

// Asientos con los que se calculan los límites:
//  - interna: sin tope;
//  - en prueba (aunque ya haya vencido): TRIAL_MAX_SEATS;
//  - con o sin suscripción vigente: los cobrados (quantity de Stripe, mínimo 1).
//    Una cancelada/solo lectura conserva su último número: igual no escribe.
export function seatCap(org: SeatSnapshot): number {
  if (org.isInternal) return Infinity;
  if (org.status === "TRIALING") return TRIAL_MAX_SEATS;
  // Nunca más que el tope del plan (Esencial: 3), aunque Stripe diga otra cosa.
  return Math.min(PLANS[org.plan].perOrg.maxSeats, Math.max(MIN_SEATS, org.seatQuantity || MIN_SEATS));
}

// Números de WhatsApp y cuentas de Telegram/Messenger/Instagram: 1 por
// ejecutivo que existe, sin importar el método (Coexistencia o API manual).
// Se cuentan los usuarios activos (una invitación pendiente todavía no es un
// ejecutivo), con tope en los asientos (en prueba, TRIAL_MAX_SEATS) y mínimo 1.
export function channelSeatBase(org: SeatSnapshot, activeUsers: number): number {
  if (org.isInternal) return Infinity;
  return Math.min(seatCap(org), Math.max(MIN_SEATS, Math.floor(activeUsers)));
}

// Límites vigentes: los del plan por asiento; en prueba, contactos y créditos
// son la bolsa plana TRIAL_POOL; las internas no tienen tope.
export function planLimits(org: SeatSnapshot): PlanLimits {
  if (org.isInternal) return UNLIMITED;
  return limitsForSeats(PLANS[org.plan], seatCap(org), { trial: org.status === "TRIALING" });
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
// Recordatorios por correo/notificación de la prueba (14 días): a 7, 3 y 1 día
// de terminar. El banner se pone en amarillo desde TRIAL_ENDING_NOTICE_DAYS.
export const TRIAL_REMINDER_DAYS: readonly number[] = [7, 3, 1];

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

// Purga de datos (lo que prometen términos y aviso de privacidad):
//  - cancelada: RETENTION_DAYS_AFTER_CANCEL días después de cancelarse;
//  - prueba vencida sin haber pagado nunca (solo lectura y sin suscripción):
//    RETENTION_DAYS_AFTER_TRIAL días después de vencer la prueba.
// Sin la fecha de referencia no se purga: mejor conservar que borrar por error.
// Una solo lectura CON suscripción (impago) nunca se purga por esta vía: su
// destino lo decide Stripe (se recupera o termina cancelada).
export interface PurgeSnapshot {
  status: OrganizationStatus;
  isInternal: boolean;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
}

export function purgeDue(org: PurgeSnapshot, now: Date): boolean {
  if (org.isInternal) return false;
  const elapsed = (from: Date) => now.getTime() - from.getTime();
  if (org.status === "CANCELED") return !!org.canceledAt && elapsed(org.canceledAt) >= RETENTION_DAYS_AFTER_CANCEL * DAY_MS;
  if (org.status === "READ_ONLY" && !org.stripeSubscriptionId) {
    return !!org.trialEndsAt && elapsed(org.trialEndsAt) >= RETENTION_DAYS_AFTER_TRIAL * DAY_MS;
  }
  return false;
}

// ── Operación de la plataforma (panel /plataforma) ──

// Tope de créditos del periodo: el del plan más el bono que dio la plataforma
// (se reinicia con el periodo, igual que el consumo).
export function aiCreditLimit(org: SeatSnapshot & { aiCreditsBonus: number }): number {
  const limits = planLimits(org);
  // Plan sin IA (Esencial): ni el bono la habilita.
  if (!limits.aiAccess) return 0;
  return limits.aiCreditsPerMonth + Math.max(0, org.aiCreditsBonus);
}

export const MAX_TRIAL_EXTENSION_DAYS = 90;

// Extender (o volver a dar) la prueba. Solo sin suscripción de pago vigente:
// a quien paga se le ayuda desde Stripe, no con días de prueba. Una cancelada
// que recibe prueba sale de la cuenta regresiva de purga (canceledAt: null).
export function extendTrial(
  org: { status: OrganizationStatus; isInternal: boolean; trialEndsAt: Date | null; stripeSubscriptionId: string | null },
  days: number,
  now: Date
): { error: string } | { status: OrganizationStatus; trialEndsAt: Date; canceledAt: null; graceEndsAt: null } {
  if (org.isInternal) return { error: "Una organización interna no tiene prueba" };
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS) return { error: `Los días deben ser entre 1 y ${MAX_TRIAL_EXTENSION_DAYS}` };
  if (org.status === "SUSPENDED") return { error: "Reactiva la organización antes de extender su prueba" };
  if (org.status === "ACTIVE" || org.status === "PAST_DUE") return { error: "La organización tiene una suscripción vigente" };
  if (org.status === "READ_ONLY" && org.stripeSubscriptionId) return { error: "La organización está en solo lectura por un pago: se resuelve en Stripe" };
  const from = org.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now;
  return { status: "TRIALING", trialEndsAt: new Date(from.getTime() + days * DAY_MS), canceledAt: null, graceEndsAt: null };
}

// Estado al quitar una suspensión cuando no hay suscripción que consultar en
// Stripe (con suscripción, el estado lo decide syncSubscription).
export function statusAfterSuspension(org: { trialEndsAt: Date | null; canceledAt: Date | null }, now: Date): OrganizationStatus {
  if (org.canceledAt) return "CANCELED";
  if (org.trialEndsAt && org.trialEndsAt > now) return "TRIALING";
  return "READ_ONLY";
}

// ── Stripe ──

export interface SubscriptionSnapshot {
  status: string; // Stripe.Subscription.Status
  priceId: string | null;
  // quantity del item = asientos cobrados.
  quantity: number | null;
  currentPeriodEnd: number | null; // unix (segundos)
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionUpdate {
  plan?: PlanId;
  seatQuantity?: number;
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
  // Cambio de asientos (desde la app, el portal o el dashboard de Stripe):
  // la cantidad de Stripe manda.
  if (sub.quantity && sub.quantity >= MIN_SEATS) update.seatQuantity = Math.floor(sub.quantity);

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

// ── Asientos: cambios de cantidad y de plan ──

export interface SeatUsage {
  seats: number; // usuarios activos + invitaciones pendientes
  whatsapp: number;
  // Cuentas conectadas de cada tipo (sin el widget web).
  telegram: number;
  messenger: number;
  instagram: number;
  webchat: number; // cuentas de chat web
  contacts: number;
  activeAutomations: number;
  apiKeys: number; // claves de API activas
  webhooks: number; // webhooks salientes activos
}

export interface PlanChangeImpact {
  // Impiden el cambio: hay que resolverlos antes (la app no los decide sola).
  blockers: string[];
  // Se pierde o se reduce algo, pero el cambio procede si el admin confirma.
  warnings: string[];
}

const fmt = (n: number) => n.toLocaleString("es-MX");

// Qué pasa al pasar a `targetPlan` con `targetSeats` asientos, comparado con
// lo que la organización usa hoy. Regla:
//  - no se puede bajar de los asientos ocupados (usuarios activos + invitaciones):
//    primero se desactiva a alguien o se revoca una invitación;
//  - no se puede tener más números de WhatsApp que asientos (1 por ejecutivo),
//    ni más cuentas de Telegram, Messenger o Instagram (1 de cada tipo por
//    ejecutivo);
//  - no más ejecutivos que el tope del plan (Esencial: 3);
//  - Esencial no incluye Telegram, Messenger, Instagram ni chat web: hay que
//    desconectarlos antes;
//  - Esencial permite 1 automatización activa y Negocio 5: hay que pausar las de sobra;
//  - avisos (no bloquean): la API y los webhooks dejan de funcionar fuera de Pro,
//    la IA deja de funcionar en Esencial, los contactos por encima del nuevo
//    tope se conservan pero no se agregan nuevos.
export function planChangeImpact(targetPlan: PlanId, targetSeats: number, usage: SeatUsage): PlanChangeImpact {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const plan = PLANS[targetPlan];
  if (!Number.isInteger(targetSeats) || targetSeats < MIN_SEATS) {
    blockers.push(`Necesitas al menos ${MIN_SEATS} ejecutivo.`);
    return { blockers, warnings };
  }
  if (targetSeats > plan.perOrg.maxSeats) {
    blockers.push(`${plan.name} admite hasta ${fmt(plan.perOrg.maxSeats)} ejecutivos. Elige ${fmt(plan.perOrg.maxSeats)} o menos, o un plan mayor.`);
    return { blockers, warnings };
  }
  const l = limitsForSeats(plan, targetSeats);
  if (usage.seats > targetSeats) {
    blockers.push(
      `Tu equipo ocupa ${fmt(usage.seats)} ${usage.seats === 1 ? "asiento" : "asientos"} (usuarios activos e invitaciones pendientes). Desactiva usuarios o revoca invitaciones hasta quedar en ${fmt(targetSeats)}.`
    );
  }
  if (usage.whatsapp > l.whatsapp) {
    blockers.push(`Tienes ${fmt(usage.whatsapp)} números de WhatsApp y cada ejecutivo conecta 1. Desconecta números hasta quedar en ${fmt(l.whatsapp)}.`);
  }
  for (const ch of SEAT_CHANNELS) {
    if (usage[ch] > l[ch]) {
      const label = SEAT_CHANNEL_LABELS[ch];
      if (l[ch] === 0) {
        blockers.push(`${plan.name} no incluye ${label}: desconecta tus ${fmt(usage[ch])} ${usage[ch] === 1 ? "cuenta" : "cuentas"} de ${label} antes de cambiar.`);
        continue;
      }
      blockers.push(`Tienes ${fmt(usage[ch])} cuentas de ${label} y cada ejecutivo conecta 1. Desconecta cuentas de ${label} hasta quedar en ${fmt(l[ch])}.`);
    }
  }
  if (!l.webchat && usage.webchat > 0) {
    blockers.push(`${plan.name} no incluye el chat web: elimina tus ${fmt(usage.webchat)} ${usage.webchat === 1 ? "cuenta" : "cuentas"} de chat web antes de cambiar.`);
  }
  if (Number.isFinite(l.activeAutomations) && usage.activeAutomations > l.activeAutomations) {
    blockers.push(
      `${plan.name} permite ${l.activeAutomations} ${l.activeAutomations === 1 ? "automatización activa" : "automatizaciones activas"} y tienes ${fmt(usage.activeAutomations)}. Pausa las que sobran antes de cambiar.`
    );
  }
  if (!l.aiAccess) {
    warnings.push(`${plan.name} no incluye IA: tus bots de IA, calificadores de leads, sugerencias y recuperación de leads dejarán de funcionar (su configuración se conserva).`);
  }
  if (!l.apiAccess && (usage.apiKeys > 0 || usage.webhooks > 0)) {
    warnings.push(`La API y los webhooks son del plan Pro: tus ${fmt(usage.apiKeys)} claves de API y ${fmt(usage.webhooks)} webhooks dejarán de funcionar.`);
  }
  if (usage.contacts > l.contacts) {
    warnings.push(`Tienes ${fmt(usage.contacts)} contactos y el nuevo tope es ${fmt(l.contacts)}: se conservan todos, pero no podrás agregar nuevos (los mensajes entrantes se siguen guardando).`);
  }
  return { blockers, warnings };
}

