import type { PlanId } from "@prisma/client";
import { monthlyTotalMxn, PLANS } from "./plans";
import { monthlyTotalForLicenses, type LicenseCounts } from "./licenses";

// Reglas puras de la integración con Stripe (sin SDK ni base): lookup keys de
// los precios, prorrateo de cambios y llaves de idempotencia. Testeadas en
// lib/billing/__tests__/stripe-rules.test.ts.

// Cada plan tiene un precio recurrente mensual en MXN por unidad con esta
// lookup_key en Stripe. Se resuelven primero por lookup_key (así cambiar un
// precio en Stripe no exige editar /plataforma) y, si no existen, se usan los
// price ids guardados en /plataforma.
export const PLAN_LOOKUP_KEYS: Record<PlanId, string> = {
  ESSENTIAL: "colibly_esencial_monthly",
  BUSINESS: "colibly_negocio_monthly",
  PRO: "colibly_pro_monthly",
};

export function planForLookupKey(lookupKey: string | null | undefined): PlanId | null {
  if (!lookupKey) return null;
  const hit = (Object.keys(PLAN_LOOKUP_KEYS) as PlanId[]).find((p) => PLAN_LOOKUP_KEYS[p] === lookupKey);
  return hit ?? null;
}

// Un precio es válido solo si es exactamente el de la oferta: mismo monto,
// moneda MXN y recurrencia mensual. Evita cobrar un precio viejo que quedó
// bajo la misma lookup key o un price id mal pegado en /plataforma.
export function priceMatchesPlan(
  plan: PlanId,
  price: { unit_amount: number | null; currency: string; recurring?: { interval?: string } | null }
): boolean {
  return (
    price.unit_amount === PLANS[plan].pricePerSeatMxn * 100 &&
    price.currency.toLowerCase() === "mxn" &&
    price.recurring?.interval === "month"
  );
}

export type ProrationBehavior = "always_invoice" | "create_prorations";

// Subir (más asientos o un plan más caro: el total mensual crece) se cobra de
// inmediato con una factura de prorrateo; bajar deja el crédito para la
// siguiente factura, como antes. Si no se conoce el plan de origen, no se
// cobra de inmediato (comportamiento previo).
export function prorationBehaviorFor(from: { plan: PlanId | null; seats: number }, to: { plan: PlanId; seats: number }): ProrationBehavior {
  if (!from.plan) return "create_prorations";
  const before = monthlyTotalMxn(PLANS[from.plan], from.seats);
  const after = monthlyTotalMxn(PLANS[to.plan], to.seats);
  return after > before ? "always_invoice" : "create_prorations";
}

// Checkout: la misma organización pidiendo el mismo plan, asientos y fin de
// prueba dentro de una ventana de 10 minutos recibe la misma sesión (doble
// clic o reintento de red). Pasada la ventana se crea una sesión nueva: las
// llaves de Stripe duran 24 h y una sesión vencida no debe reutilizarse.
export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;
export function checkoutIdempotencyKey(input: { organizationId: string; plan: PlanId; seats: number; trialEnd: number | null; customerId: string }, now: number): string {
  const bucket = Math.floor(now / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  return `checkout:${input.organizationId}:${input.customerId}:${input.plan}:${input.seats}:${input.trialEnd ?? "none"}:${bucket}`;
}

// Cambio de plan/asientos: origen → destino más un id por solicitud. Sin el
// id, ir de 3 a 4 asientos, volver a 3 y otra vez a 4 dentro de 24 h repetía
// la llave del primer cambio y Stripe devolvía esa respuesta guardada sin
// aplicar nada. Los reintentos de red del SDK reusan la misma llave, y dos
// solicitudes al mismo destino son inofensivas (la segunda no cambia nada).
export function subscriptionUpdateIdempotencyKey(input: {
  subscriptionId: string;
  fromPriceId: string;
  fromQuantity: number;
  toPriceId: string;
  toQuantity: number;
  requestId: string;
}): string {
  return `sub-update:${input.subscriptionId}:${input.fromPriceId}x${input.fromQuantity}->${input.toPriceId}x${input.toQuantity}:${input.requestId}`;
}

// Estados en los que una suscripción sigue cobrándose (o puede volver a
// cobrarse). Sirve para detectar una segunda suscripción de la misma
// organización: la anterior seguiría facturando aunque la app ya no la vea.
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);
export function isLiveSubscriptionStatus(status: string): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.has(status);
}

// Parámetros de la Checkout Session (puros para poder testearlos).
export function checkoutSessionParams(input: {
  customerId: string;
  organizationId: string;
  // Una línea (catálogo anterior: plan × asientos) o varias (licencias por plan).
  priceId?: string;
  seats?: number;
  lineItems?: Array<{ price: string; quantity: number }>;
  trialEnd: number | null;
  automaticTax: boolean;
  successUrl: string;
  cancelUrl: string;
}) {
  return {
    mode: "subscription" as const,
    customer: input.customerId,
    client_reference_id: input.organizationId,
    locale: "es" as const,
    line_items: input.lineItems ?? [{ price: input.priceId!, quantity: input.seats ?? 1 }],
    // Datos para facturar en México: dirección obligatoria y RFC opcional;
    // se guardan en el cliente de Stripe (customer_update) para las facturas
    // siguientes y el portal.
    billing_address_collection: "required" as const,
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto" as const, name: "auto" as const },
    // Stripe Tax: interruptor en /plataforma, apagado hasta definir el IVA.
    automatic_tax: { enabled: input.automaticTax },
    subscription_data: {
      metadata: { organizationId: input.organizationId, ...(input.lineItems ? { catalog: "licenses" } : {}) },
      ...(input.trialEnd ? { trial_end: input.trialEnd } : {}),
    },
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

// ── Licencias por usuario: una línea por plan (docs/PLAN_LICENCIAS_2026-11-04.md) ──
//
// La suscripción lleva hasta 3 items, uno por precio (Básico, Avanzado, Pro),
// con quantity = licencias de ese plan. Mismos precios que el catálogo
// anterior: una suscripción vieja de un solo item ya es "N licencias del plan".

const LICENSE_PLAN_ORDER: readonly PlanId[] = ["ESSENTIAL", "BUSINESS", "PRO"];

/** Líneas de Checkout para unas cantidades por plan (omite los ceros). */
export function licenseLineItems(counts: LicenseCounts, priceFor: (plan: PlanId) => string) {
  return LICENSE_PLAN_ORDER.filter((p) => Math.floor(counts[p] || 0) > 0).map((p) => ({ price: priceFor(p), quantity: Math.floor(counts[p]) }));
}

export interface CurrentSubscriptionItem {
  id: string;
  plan: PlanId | null; // null = un precio que no es de ningún plan (se deja como está)
  quantity: number;
}

/**
 * Items para `subscriptions.update` que llevan la suscripción a `target`:
 * actualiza la cantidad de las líneas existentes, agrega las que faltan y
 * borra las que quedan en 0. Dos líneas del mismo plan (no debería pasar) se
 * funden en la primera. Un item de un precio desconocido no se toca.
 */
export function licenseItemsUpdate(current: CurrentSubscriptionItem[], target: LicenseCounts, priceFor: (plan: PlanId) => string) {
  const out: Array<{ id: string; quantity: number } | { id: string; deleted: true } | { price: string; quantity: number }> = [];
  for (const plan of LICENSE_PLAN_ORDER) {
    const want = Math.max(0, Math.floor(target[plan] || 0));
    const items = current.filter((i) => i.plan === plan);
    const [first, ...dupes] = items;
    if (first) {
      if (want === 0) out.push({ id: first.id, deleted: true });
      else if (first.quantity !== want) out.push({ id: first.id, quantity: want });
    } else if (want > 0) {
      out.push({ price: priceFor(plan), quantity: want });
    }
    for (const d of dupes) out.push({ id: d.id, deleted: true });
  }
  return out;
}

/** Cantidades por plan que cobra la suscripción (suma líneas repetidas; ignora precios desconocidos). */
export function licenseCountsFromItems(items: Array<{ plan: PlanId | null; quantity: number | null }>): LicenseCounts {
  const out: LicenseCounts = { ESSENTIAL: 0, BUSINESS: 0, PRO: 0 };
  for (const i of items) if (i.plan) out[i.plan] += Math.max(0, Math.floor(i.quantity ?? 0));
  return out;
}

/** Subir el total mensual se cobra de inmediato; bajar deja el crédito para la siguiente factura. */
export function licenseProrationBehavior(from: LicenseCounts, to: LicenseCounts): ProrationBehavior {
  const price = (p: PlanId) => PLANS[p].pricePerSeatMxn;
  return monthlyTotalForLicenses(to, price) > monthlyTotalForLicenses(from, price) ? "always_invoice" : "create_prorations";
}

const countsKey = (c: LicenseCounts) => LICENSE_PLAN_ORDER.map((p) => Math.floor(c[p] || 0)).join("-");

export function licenseCheckoutIdempotencyKey(input: { organizationId: string; customerId: string; counts: LicenseCounts; trialEnd: number | null }, now: number): string {
  const bucket = Math.floor(now / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  return `checkout-licenses:${input.organizationId}:${input.customerId}:${countsKey(input.counts)}:${input.trialEnd ?? "none"}:${bucket}`;
}

export function licenseUpdateIdempotencyKey(input: { subscriptionId: string; from: LicenseCounts; to: LicenseCounts; requestId: string }): string {
  return `sub-licenses:${input.subscriptionId}:${countsKey(input.from)}->${countsKey(input.to)}:${input.requestId}`;
}
