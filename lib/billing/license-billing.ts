import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BILLING_PLAN_PATH, checkPlanLimit, getOrgBilling, invalidateOrgBilling } from "./gates";
import { invalidateUserEntitlement } from "./entitlements";
import {
  catalogMode,
  countLicenses,
  licenseAssignBlocker,
  licenseAvailability,
  licenseChangeImpact,
  licenseTargetBlockers,
  purchasedAfterLicenseChange,
  TRIAL_LICENSE,
  type CatalogMode,
  type LicenseChangeImpact,
  type LicenseCounts,
  type LicenseUsage,
} from "./licenses";
import { PLANS } from "./plans";
import { syncSubscription, updateSubscriptionLicenses } from "./stripe";

// Licencias por usuario, Fase 3 (docs/PLAN_LICENCIAS_2026-11-04.md): cuántas
// licencias de cada plan contrata la organización (líneas de Stripe), a quién
// se asigna cada una y el cambio de licencia de una persona. Las reglas puras
// viven en licenses.ts y stripe-rules.ts.

export const BILLING_LICENSES_PATH = "/configuracion/plan#licencias";

const planName = (id: PlanId) => PLANS[id].name;

export interface LicenseState {
  mode: CatalogMode;
  trialing: boolean;
  hasSubscription: boolean;
  isInternal: boolean;
  legacyUntil: Date | null;
  purchased: LicenseCounts;
  /** Personas activas + invitaciones pendientes, por licencia. */
  assigned: LicenseCounts;
  free: LicenseCounts;
  overAssigned: LicenseCounts;
}

export async function assignedLicenseCounts(organizationId: string, fallback: PlanId = TRIAL_LICENSE): Promise<LicenseCounts> {
  const [users, invites] = await Promise.all([
    prisma.user.findMany({ where: { organizationId, disabledAt: null }, select: { license: true } }),
    prisma.authToken.findMany({ where: { organizationId, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } }, select: { license: true } }),
  ]);
  return countLicenses([...users.map((u) => u.license), ...invites.map((i) => i.license ?? fallback)]);
}

export async function getLicenseState(organizationId: string): Promise<LicenseState | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      status: true,
      isInternal: true,
      legacyUntil: true,
      stripeSubscriptionId: true,
      licensesEssential: true,
      licensesBusiness: true,
      licensesPro: true,
    },
  });
  if (!org) return null;
  const purchased: LicenseCounts = { ESSENTIAL: org.licensesEssential, BUSINESS: org.licensesBusiness, PRO: org.licensesPro };
  const assigned = await assignedLicenseCounts(organizationId, org.plan);
  const { free, overAssigned } = licenseAvailability(purchased, assigned);
  return {
    mode: catalogMode(org, new Date()),
    trialing: org.status === "TRIALING",
    hasSubscription: !!org.stripeSubscriptionId && org.status !== "CANCELED",
    isInternal: org.isInternal,
    legacyUntil: org.legacyUntil,
    purchased,
    assigned,
    free,
    overAssigned,
  };
}

/**
 * ¿Cabe una persona más con `license`? (invitar, crear, reactivar). 402 con
 * `code: "plan_limit"`, `limit: "licenses"` si no. En el catálogo anterior
 * sigue el candado de asientos.
 */
export async function checkLicenseAvailable(organizationId: string, license: PlanId): Promise<NextResponse | null> {
  const state = await getLicenseState(organizationId);
  if (!state) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  if (state.mode === "legacy") return checkPlanLimit(organizationId, "seats");
  const blocker = licenseAssignBlocker({ license, ...state, planName });
  if (!blocker) return null;
  return NextResponse.json(
    { error: blocker, code: "plan_limit", limit: "licenses", license, billingUrl: BILLING_LICENSES_PATH, actionUrl: BILLING_LICENSES_PATH },
    { status: 402 }
  );
}

/** Licencia con la que entra alguien si el admin no elige: una libre (la más alta), o la de la prueba. */
export async function suggestedLicense(organizationId: string): Promise<PlanId> {
  const state = await getLicenseState(organizationId);
  if (!state) return TRIAL_LICENSE;
  if (state.trialing && !state.hasSubscription) return TRIAL_LICENSE;
  const free = (["PRO", "BUSINESS", "ESSENTIAL"] as const).find((p) => state.free[p] > 0);
  return free ?? (await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true } }))?.plan ?? TRIAL_LICENSE;
}

// ── Cambiar cuántas licencias se contratan ──

export type LicenseBillingResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      status: number;
      code: "not_found" | "internal" | "no_subscription" | "blocked" | "payment_pending" | "legacy" | "confirm_required";
      error: string;
      blockers?: string[];
      impact?: LicenseChangeImpact;
      invoiceUrl?: string | null;
    };

const PAYMENT_PENDING_MESSAGE =
  "Stripe no pudo completar el cobro de la diferencia (la tarjeta lo rechazó o tu banco pide confirmarlo), así que el cambio todavía no se aplica. Paga la factura pendiente, con la misma u otra tarjeta, y se aplicará en cuanto quede pagada.";

/**
 * Lleva la suscripción a `target` licencias por plan. Nunca por debajo de lo
 * asignado. En una organización del catálogo anterior, hacerlo es pasarse a
 * licencias: se apaga `legacyUntil` (mismos precios, la línea ya existe).
 */
export async function applyLicenseChange(organizationId: string, target: LicenseCounts): Promise<LicenseBillingResult> {
  const state = await getLicenseState(organizationId);
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { stripeSubscriptionId: true } });
  if (!state || !org) return { ok: false, status: 404, code: "not_found", error: "Organización no encontrada" };
  if (state.isInternal) return { ok: false, status: 400, code: "internal", error: "Esta cuenta interna no requiere plan" };
  if (!state.hasSubscription || !org.stripeSubscriptionId) {
    return { ok: false, status: 409, code: "no_subscription", error: "Aún no tienes una suscripción activa: contrata tus licencias primero." };
  }
  const blockers = licenseTargetBlockers(target, state.assigned, planName);
  if (blockers.length > 0) return { ok: false, status: 409, code: "blocked", error: blockers[0], blockers };

  const result = await updateSubscriptionLicenses(org.stripeSubscriptionId, { target, requestId: randomUUID() });
  if (result.pending) {
    await syncSubscription(org.stripeSubscriptionId, organizationId);
    return { ok: false, status: 402, code: "payment_pending", error: PAYMENT_PENDING_MESSAGE, invoiceUrl: result.pending.invoiceUrl };
  }
  if (state.mode === "legacy") await prisma.organization.update({ where: { id: organizationId }, data: { legacyUntil: null } });
  await syncSubscription(org.stripeSubscriptionId, organizationId);
  invalidateOrgBilling(organizationId);
  return { ok: true, changed: result.changed || state.mode === "legacy" };
}

// ── Cambiar la licencia de una persona ──

/** Lo que la persona tiene encendido y depende de su licencia (para avisar qué se apaga). */
export async function licenseUsageFor(userId: string): Promise<LicenseUsage> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, organization: { select: { leadRecoveryEnabled: true } } } });
  const [botsWa, botsCh, activeAutomations, scheduledCampaigns, activeScorers, activeMonitors, apiKeys, webhooks, metaAdsAccounts] = await Promise.all([
    prisma.wABot.count({ where: { isActive: true, waAccount: { ownerId: userId } } }),
    prisma.wABot.count({ where: { isActive: true, channelAccount: { ownerId: userId } } }),
    prisma.automation.count({ where: { createdById: userId, status: "ACTIVE" } }),
    prisma.wACampaign.count({ where: { status: { in: ["SCHEDULED", "SENDING"] }, waAccount: { ownerId: userId } } }),
    prisma.wALeadScorerBot.count({ where: { userId, isActive: true } }),
    prisma.topicMonitor.count({ where: { createdById: userId, active: true } }),
    prisma.apiKey.count({ where: { userId, revokedAt: null } }),
    prisma.webhookEndpoint.count({ where: { userId, active: true } }),
    prisma.metaAdsAccount.count({ where: { userId, status: "CONNECTED" } }),
  ]);
  const ownedChannelsWithBot = botsWa + botsCh;
  return {
    ownedChannelsWithBot,
    activeAutomations,
    scheduledCampaigns,
    activeScorers,
    activeMonitors,
    leadRecoveryOn: !!user?.organization.leadRecoveryEnabled && ownedChannelsWithBot > 0,
    apiKeys,
    webhooks,
    metaAdsAccounts,
  };
}

/**
 * Cambia la licencia de una persona. Sin licencia libre del plan destino, con
 * `adjustBilling` se compra una (y se deja de pagar la que queda libre); sin
 * él, se bloquea. Lo que deja de funcionar se avisa y pide `confirm`; la
 * configuración se conserva (los candados de entitlements.ts la pausan).
 */
export async function changeUserLicense(
  organizationId: string,
  userId: string,
  to: PlanId,
  opts: { confirm: boolean; adjustBilling: boolean }
): Promise<LicenseBillingResult> {
  const [state, user, org] = await Promise.all([
    getLicenseState(organizationId),
    prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, license: true, disabledAt: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { stripeSubscriptionId: true, legacyUntil: true } }),
  ]);
  if (!state || !user || !org) return { ok: false, status: 404, code: "not_found", error: "Usuario no encontrado" };
  if (state.mode === "legacy") {
    const until = org.legacyUntil?.toLocaleDateString("es-MX", { day: "numeric", month: "long" }) ?? "";
    return {
      ok: false,
      status: 409,
      code: "legacy",
      error: `Tu organización conserva el plan anterior${until ? ` hasta el ${until}` : ""}. Pásate a licencias en Configuración → Plan y facturación para elegir la licencia de cada persona.`,
    };
  }
  const from = user.license;
  if (from === to) return { ok: true, changed: false };

  // Una persona desactivada no ocupa licencia: cambiarla no toca la factura.
  const occupies = !user.disabledAt;
  const freeOfTarget =
    state.isInternal || (state.trialing && !state.hasSubscription) || !occupies ? Infinity : state.free[to] + (opts.adjustBilling ? 1 : 0);
  const impact = licenseChangeImpact({ from, to, freeOfTarget, usage: await licenseUsageFor(userId), planName });
  if (impact.blockers.length > 0) return { ok: false, status: 409, code: "blocked", error: impact.blockers[0], blockers: impact.blockers, impact };
  if (impact.warnings.length > 0 && !opts.confirm) {
    return { ok: false, status: 409, code: "confirm_required", error: `Revisa lo que cambia al pasar a ${planName(to)} antes de confirmar.`, impact };
  }

  const payingPeriod = occupies && state.hasSubscription && !state.isInternal && !!org.stripeSubscriptionId;
  if (payingPeriod && opts.adjustBilling) {
    const target = purchasedAfterLicenseChange(state.purchased, state.assigned, from, to);
    if (target) {
      const result = await updateSubscriptionLicenses(org.stripeSubscriptionId!, { target, requestId: randomUUID() });
      await syncSubscription(org.stripeSubscriptionId!, organizationId);
      if (result.pending) return { ok: false, status: 402, code: "payment_pending", error: PAYMENT_PENDING_MESSAGE, invoiceUrl: result.pending.invoiceUrl };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { license: to } });
  invalidateUserEntitlement(userId);
  invalidateOrgBilling(organizationId);
  return { ok: true, changed: true };
}

/** Para las rutas: el 402/409 del resultado. */
export function licenseResultResponse(result: Extract<LicenseBillingResult, { ok: false }>): NextResponse {
  return NextResponse.json(
    {
      error: result.error,
      code: result.code,
      blockers: result.blockers,
      impact: result.impact,
      invoiceUrl: result.invoiceUrl,
      ...(result.code === "legacy" || result.code === "no_subscription" ? { actionUrl: BILLING_PLAN_PATH } : {}),
    },
    { status: result.status }
  );
}

/** Para mostrar en pantallas: el plan de la licencia. */
export async function orgDefaultLicense(organizationId: string): Promise<PlanId> {
  const org = await getOrgBilling(organizationId);
  return org?.plan ?? TRIAL_LICENSE;
}
