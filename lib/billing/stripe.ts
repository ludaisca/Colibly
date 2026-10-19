import Stripe from "stripe";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform-settings";
import { deriveFromSubscription, type SubscriptionSnapshot } from "./state";
import { invalidateOrgBilling } from "./gates";
import { notifyBillingTransition } from "./notify";

// Integración con Stripe: cliente, precios por plan y sincronización de la
// suscripción → Organization. Configuración (secret key, webhook secret,
// price ids) editable desde /plataforma — ver lib/platform-settings.ts.
//
// Cobro por asiento: cada plan es UN precio recurrente mensual en MXN por
// unidad (99 / 199 / 349 MXN: Esencial, Negocio, Pro), y la suscripción lleva un solo item con
// quantity = asientos (ejecutivos). Cambiar asientos o plan actualiza ese item
// con prorrateo (create_prorations, el default de Stripe).

export async function isStripeConfigured(): Promise<boolean> {
  const s = await getPlatformSettings();
  return !!(s.stripeSecretKey && s.stripePriceEssential && s.stripePriceBusiness && s.stripePricePro);
}

export async function getStripe(): Promise<Stripe> {
  const { stripeSecretKey } = await getPlatformSettings();
  if (!stripeSecretKey) throw new Error("Stripe no está configurado (falta la secret key en /plataforma)");
  // Sin caché de instancia a propósito: la key puede cambiar desde la GUI y
  // construir un cliente de Stripe no hace ninguna llamada de red.
  return new Stripe(stripeSecretKey, { timeout: 20_000, maxNetworkRetries: 2 });
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  return (await getPlatformSettings()).stripeWebhookSecret;
}

export async function priceIdFor(plan: PlanId): Promise<string> {
  const s = await getPlatformSettings();
  const id = { ESSENTIAL: s.stripePriceEssential, BUSINESS: s.stripePriceBusiness, PRO: s.stripePricePro }[plan];
  if (!id) throw new Error(`Falta el precio de Stripe del plan ${plan} en /plataforma`);
  return id;
}

export async function planForPrice(priceId: string): Promise<PlanId | null> {
  const { stripePriceEssential, stripePriceBusiness, stripePricePro } = await getPlatformSettings();
  if (priceId === stripePriceEssential) return "ESSENTIAL";
  if (priceId === stripePriceBusiness) return "BUSINESS";
  if (priceId === stripePricePro) return "PRO";
  return null;
}

export const STRIPE_PRICE_CURRENCY = "mxn";

// Cambia plan y/o asientos de una suscripción existente (un solo item). El
// prorrateo lo calcula Stripe y aparece en la siguiente factura.
export async function updateSubscriptionItem(subscriptionId: string, opts: { priceId: string; quantity: number }): Promise<void> {
  const stripe = await getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error(`La suscripción ${subscriptionId} no tiene items`);
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price: opts.priceId, quantity: opts.quantity }],
    proration_behavior: "create_prorations",
  });
}

export function subscriptionSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  return {
    status: sub.status,
    priceId: item?.price.id ?? null,
    quantity: item?.quantity ?? null,
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
  const sub = await (await getStripe()).subscriptions.retrieve(subscriptionId);
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

  const snapshot = subscriptionSnapshot(sub);
  const currency = sub.items.data[0]?.price.currency;
  if (currency && currency !== STRIPE_PRICE_CURRENCY) {
    console.warn(`[billing] La suscripción ${sub.id} usa un precio en ${currency}; los planes son en MXN (revisa los price ids en /plataforma)`);
  }
  // deriveFromSubscription es pura y síncrona (lib/billing/state.ts, testeada
  // sin Stripe/DB) — el plan se resuelve aquí, antes de llamarla, en vez de
  // pasarle planForPrice (que ahora es async) como callback.
  const plan = snapshot.priceId ? await planForPrice(snapshot.priceId) : null;
  const update = deriveFromSubscription(snapshot, org, new Date(), () => plan);
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
