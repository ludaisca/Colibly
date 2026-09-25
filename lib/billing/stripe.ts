import Stripe from "stripe";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveFromSubscription, type SubscriptionSnapshot } from "./state";
import { invalidateOrgBilling } from "./gates";
import { notifyBillingTransition } from "./notify";

// Integración con Stripe: cliente, precios por plan y sincronización de la
// suscripción → Organization. Variables: STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO (IDs de precio
// mensual en USD).

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_BASIC && process.env.STRIPE_PRICE_PRO);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado (STRIPE_SECRET_KEY)");
  client ??= new Stripe(key, { timeout: 20_000, maxNetworkRetries: 2 });
  return client;
}

export function priceIdFor(plan: PlanId): string {
  const id = plan === "BASIC" ? process.env.STRIPE_PRICE_BASIC : process.env.STRIPE_PRICE_PRO;
  if (!id) throw new Error(`Falta el precio de Stripe del plan ${plan}`);
  return id;
}

export function planForPrice(priceId: string): PlanId | null {
  if (priceId === process.env.STRIPE_PRICE_BASIC) return "BASIC";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  return null;
}

export function subscriptionSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  return {
    status: sub.status,
    priceId: item?.price.id ?? null,
    // Desde la API 2025-03 el periodo vive en cada item, no en la suscripción.
    currentPeriodEnd: item?.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || !!sub.cancel_at,
  };
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// Relee la suscripción de Stripe (fuente de verdad: así el orden en que llegan
// los eventos no importa) y la aplica a su organización. Devuelve el id de la
// organización, o null si no se pudo asociar.
export async function syncSubscription(subscriptionId: string, hintOrganizationId?: string | null): Promise<string | null> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const customerId = idOf(sub.customer);
  const metaOrg = sub.metadata?.organizationId || null;

  const org =
    (await prisma.organization.findUnique({ where: { stripeSubscriptionId: sub.id } })) ??
    (metaOrg ? await prisma.organization.findUnique({ where: { id: metaOrg } }) : null) ??
    (hintOrganizationId ? await prisma.organization.findUnique({ where: { id: hintOrganizationId } }) : null) ??
    (customerId ? await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } }) : null);
  if (!org) {
    console.warn(`[billing] Suscripción ${sub.id} sin organización asociada`);
    return null;
  }

  // Una suscripción vieja (ya reemplazada por otra) no debe pisar el estado:
  // solo cuenta la vigente de la organización.
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id && ["canceled", "incomplete_expired"].includes(sub.status)) {
    return org.id;
  }

  const update = deriveFromSubscription(subscriptionSnapshot(sub), org, new Date(), planForPrice);
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      ...update,
      stripeSubscriptionId: sub.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      // Pagar cierra la prueba: ya no aplica su fecha.
      ...(update.status === "ACTIVE" ? { trialEndsAt: null } : {}),
    },
  });
  invalidateOrgBilling(org.id);

  const next: OrganizationStatus = update.status ?? org.status;
  if (next !== org.status) await notifyBillingTransition(org.id, org.status, next);
  return org.id;
}
