import type { PlanId } from "@prisma/client";
import { monthlyTotalMxn, PLANS } from "./plans";

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

// Cambio de plan/asientos: determinista por estado de origen y destino. Un
// reintento del mismo cambio (mismo origen) devuelve el resultado anterior; un
// cambio nuevo sale de otro estado de origen y lleva otra llave.
export function subscriptionUpdateIdempotencyKey(input: { subscriptionId: string; fromPriceId: string; fromQuantity: number; toPriceId: string; toQuantity: number }): string {
  return `sub-update:${input.subscriptionId}:${input.fromPriceId}x${input.fromQuantity}->${input.toPriceId}x${input.toQuantity}`;
}

// Parámetros de la Checkout Session (puros para poder testearlos).
export function checkoutSessionParams(input: {
  customerId: string;
  organizationId: string;
  priceId: string;
  seats: number;
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
    line_items: [{ price: input.priceId, quantity: input.seats }],
    // Datos para facturar en México: dirección obligatoria y RFC opcional;
    // se guardan en el cliente de Stripe (customer_update) para las facturas
    // siguientes y el portal.
    billing_address_collection: "required" as const,
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto" as const, name: "auto" as const },
    // Stripe Tax: interruptor en /plataforma, apagado hasta definir el IVA.
    automatic_tax: { enabled: input.automaticTax },
    subscription_data: {
      metadata: { organizationId: input.organizationId },
      ...(input.trialEnd ? { trial_end: input.trialEnd } : {}),
    },
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}
