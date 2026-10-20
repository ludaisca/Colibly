import Stripe from "stripe";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform-settings";
import { deriveFromSubscription, type SubscriptionSnapshot } from "./state";
import { invalidateOrgBilling } from "./gates";
import { notifyBillingTransition } from "./notify";
import { PLAN_LOOKUP_KEYS, planForLookupKey, prorationBehaviorFor, subscriptionUpdateIdempotencyKey } from "./stripe-rules";

// Integración con Stripe: cliente, precios por plan y sincronización de la
// suscripción → Organization. Configuración (secret key, webhook secret,
// price ids) editable desde /plataforma — ver lib/platform-settings.ts.
//
// Cobro por asiento: cada plan es UN precio recurrente mensual en MXN por
// unidad (99 / 199 / 349 MXN: Esencial, Negocio, Pro), y la suscripción lleva un solo item con
// quantity = asientos (ejecutivos). Cambiar asientos o plan actualiza ese item
// con prorrateo: subir (más asientos o plan más caro) se cobra de inmediato
// (always_invoice); bajar deja el crédito para la siguiente factura
// (create_prorations). Ver lib/billing/stripe-rules.ts.

export async function isStripeConfigured(): Promise<boolean> {
  const s = await getPlatformSettings();
  if (!s.stripeSecretKey) return false;
  const resolved = await resolvePriceIds();
  return (["ESSENTIAL", "BUSINESS", "PRO"] as const).every((p) => resolved[p] || savedPriceId(s, p));
}

type PriceMap = Partial<Record<PlanId, string>>;
type SavedPrices = { stripePriceEssential: string | null; stripePriceBusiness: string | null; stripePricePro: string | null };
function savedPriceId(s: SavedPrices, plan: PlanId): string | null {
  return { ESSENTIAL: s.stripePriceEssential, BUSINESS: s.stripePriceBusiness, PRO: s.stripePricePro }[plan] ?? null;
}

// Precios por lookup_key (colibly_*_monthly), en caché 10 min por secret key.
// Si Stripe falla o no hay precios con esas llaves, se usan los price ids de
// /plataforma.
const PRICE_CACHE_MS = 10 * 60 * 1000;
let priceCache: { key: string; at: number; map: PriceMap } | null = null;
export function invalidatePriceCache(): void {
  priceCache = null;
}
export async function resolvePriceIds(): Promise<PriceMap> {
  const { stripeSecretKey } = await getPlatformSettings();
  if (!stripeSecretKey) return {};
  const cacheKey = stripeSecretKey.slice(-12);
  if (priceCache && priceCache.key === cacheKey && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.map;
  const map: PriceMap = {};
  try {
    const stripe = await getStripe();
    const list = await stripe.prices.list({ lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: true, limit: 10 });
    for (const price of list.data) {
      const plan = planForLookupKey(price.lookup_key);
      if (plan && price.currency === STRIPE_PRICE_CURRENCY && price.recurring?.interval === "month") map[plan] = price.id;
    }
  } catch (err) {
    console.warn("[billing] No se pudieron resolver los precios por lookup_key; se usan los de /plataforma:", (err as Error)?.message);
    return map; // sin caché: se reintenta en la siguiente llamada
  }
  priceCache = { key: cacheKey, at: Date.now(), map };
  return map;
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
  const id = (await resolvePriceIds())[plan] ?? savedPriceId(s, plan);
  if (!id) throw new Error(`Falta el precio de Stripe del plan ${plan} en /plataforma`);
  return id;
}

export async function planForPrice(priceId: string, lookupKey?: string | null): Promise<PlanId | null> {
  const byKey = planForLookupKey(lookupKey);
  if (byKey) return byKey;
  const resolved = await resolvePriceIds();
  const hit = (Object.keys(resolved) as PlanId[]).find((p) => resolved[p] === priceId);
  if (hit) return hit;
  const { stripePriceEssential, stripePriceBusiness, stripePricePro } = await getPlatformSettings();
  if (priceId === stripePriceEssential) return "ESSENTIAL";
  if (priceId === stripePriceBusiness) return "BUSINESS";
  if (priceId === stripePricePro) return "PRO";
  return null;
}

export const STRIPE_PRICE_CURRENCY = "mxn";

// Cambia plan y/o asientos de una suscripción existente (un solo item).
// Subir se factura y cobra de inmediato; si ese cobro falla, el cambio queda
// pendiente y no se aplica (pending_if_incomplete). Bajar deja el crédito para
// la siguiente factura. Llave de idempotencia determinista por origen→destino.
export async function updateSubscriptionItem(subscriptionId: string, opts: { priceId: string; quantity: number; plan: PlanId }): Promise<{ prorationBehavior: string }> {
  const stripe = await getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error(`La suscripción ${subscriptionId} no tiene items`);
  const fromQuantity = item.quantity ?? 1;
  const fromPlan = await planForPrice(item.price.id, item.price.lookup_key);
  const prorationBehavior = prorationBehaviorFor({ plan: fromPlan, seats: fromQuantity }, { plan: opts.plan, seats: opts.quantity });
  await stripe.subscriptions.update(
    subscriptionId,
    {
      items: [{ id: item.id, price: opts.priceId, quantity: opts.quantity }],
      proration_behavior: prorationBehavior,
      ...(prorationBehavior === "always_invoice" ? { payment_behavior: "pending_if_incomplete" as const } : {}),
    },
    { idempotencyKey: subscriptionUpdateIdempotencyKey({ subscriptionId, fromPriceId: item.price.id, fromQuantity, toPriceId: opts.priceId, toQuantity: opts.quantity }) }
  );
  return { prorationBehavior };
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
  const plan = snapshot.priceId ? await planForPrice(snapshot.priceId, sub.items.data[0]?.price.lookup_key) : null;
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
