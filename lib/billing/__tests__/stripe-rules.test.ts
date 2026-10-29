import { describe, expect, it } from "vitest";
import { checkoutIdempotencyKey, checkoutSessionParams, CHECKOUT_IDEMPOTENCY_WINDOW_MS, isLiveSubscriptionStatus, PLAN_LOOKUP_KEYS, planForLookupKey, priceMatchesPlan, prorationBehaviorFor, subscriptionUpdateIdempotencyKey } from "../stripe-rules";

describe("lookup keys", () => {
  it("una por plan", () => {
    expect(PLAN_LOOKUP_KEYS).toEqual({ ESSENTIAL: "colibly_esencial_monthly", BUSINESS: "colibly_negocio_monthly", PRO: "colibly_pro_monthly" });
    expect(planForLookupKey("colibly_pro_monthly")).toBe("PRO");
    expect(planForLookupKey("otra")).toBeNull();
    expect(planForLookupKey(null)).toBeNull();
  });
});

describe("priceMatchesPlan", () => {
  it("acepta exactamente la oferta 59/89/149 MXN mensual", () => {
    expect(priceMatchesPlan("ESSENTIAL", { unit_amount: 5900, currency: "mxn", recurring: { interval: "month" } })).toBe(true);
    expect(priceMatchesPlan("BUSINESS", { unit_amount: 8900, currency: "MXN", recurring: { interval: "month" } })).toBe(true);
    expect(priceMatchesPlan("PRO", { unit_amount: 14900, currency: "mxn", recurring: { interval: "month" } })).toBe(true);
  });

  it("rechaza precios viejos 99/199/349", () => {
    expect(priceMatchesPlan("ESSENTIAL", { unit_amount: 9900, currency: "mxn", recurring: { interval: "month" } })).toBe(false);
    expect(priceMatchesPlan("BUSINESS", { unit_amount: 19900, currency: "mxn", recurring: { interval: "month" } })).toBe(false);
    expect(priceMatchesPlan("PRO", { unit_amount: 34900, currency: "mxn", recurring: { interval: "month" } })).toBe(false);
  });

  it("rechaza otra moneda, otro intervalo o precio sin monto", () => {
    expect(priceMatchesPlan("BUSINESS", { unit_amount: 8900, currency: "usd", recurring: { interval: "month" } })).toBe(false);
    expect(priceMatchesPlan("BUSINESS", { unit_amount: 8900, currency: "mxn", recurring: { interval: "year" } })).toBe(false);
    expect(priceMatchesPlan("BUSINESS", { unit_amount: null, currency: "mxn", recurring: { interval: "month" } })).toBe(false);
  });
});

describe("prorationBehaviorFor", () => {
  it("más asientos: cobro inmediato", () => expect(prorationBehaviorFor({ plan: "PRO", seats: 2 }, { plan: "PRO", seats: 3 })).toBe("always_invoice"));
  it("subir de plan: cobro inmediato", () => expect(prorationBehaviorFor({ plan: "ESSENTIAL", seats: 3 }, { plan: "BUSINESS", seats: 3 })).toBe("always_invoice"));
  it("menos asientos: crédito en la siguiente factura", () => expect(prorationBehaviorFor({ plan: "PRO", seats: 3 }, { plan: "PRO", seats: 2 })).toBe("create_prorations"));
  it("bajar de plan: crédito en la siguiente factura", () => expect(prorationBehaviorFor({ plan: "PRO", seats: 2 }, { plan: "BUSINESS", seats: 2 })).toBe("create_prorations"));
  it("mixto: manda el total mensual", () => {
    expect(prorationBehaviorFor({ plan: "PRO", seats: 2 }, { plan: "BUSINESS", seats: 4 })).toBe("always_invoice"); // 698 → 796
    expect(prorationBehaviorFor({ plan: "PRO", seats: 4 }, { plan: "BUSINESS", seats: 5 })).toBe("create_prorations"); // 1396 → 995
  });
  it("plan de origen desconocido: sin cobro inmediato", () => expect(prorationBehaviorFor({ plan: null, seats: 1 }, { plan: "PRO", seats: 9 })).toBe("create_prorations"));
});

describe("idempotencia", () => {
  const base = { organizationId: "org_1", customerId: "cus_1", plan: "PRO" as const, seats: 3, trialEnd: null };
  it("checkout: misma llave en la ventana de 10 min, otra después o con otros datos", () => {
    const t = 1_800_000_000_000;
    const start = Math.floor(t / CHECKOUT_IDEMPOTENCY_WINDOW_MS) * CHECKOUT_IDEMPOTENCY_WINDOW_MS;
    expect(checkoutIdempotencyKey(base, start + 1000)).toBe(checkoutIdempotencyKey(base, start + 9 * 60 * 1000));
    expect(checkoutIdempotencyKey(base, start)).not.toBe(checkoutIdempotencyKey(base, start + CHECKOUT_IDEMPOTENCY_WINDOW_MS));
    expect(checkoutIdempotencyKey(base, start)).not.toBe(checkoutIdempotencyKey({ ...base, seats: 4 }, start));
    expect(checkoutIdempotencyKey(base, start)).not.toBe(checkoutIdempotencyKey({ ...base, plan: "BUSINESS" }, start));
  });
  it("cambio de suscripción: origen, destino y solicitud", () => {
    const k = { subscriptionId: "sub_1", fromPriceId: "p1", fromQuantity: 2, toPriceId: "p1", toQuantity: 3, requestId: "req_a" };
    expect(subscriptionUpdateIdempotencyKey(k)).toBe("sub-update:sub_1:p1x2->p1x3:req_a");
    expect(subscriptionUpdateIdempotencyKey({ ...k, fromQuantity: 3, toQuantity: 2 })).not.toBe(subscriptionUpdateIdempotencyKey(k));
  });
  it("cambio de suscripción: repetir el mismo cambio más tarde (2→3, 3→2, 2→3) lleva otra llave", () => {
    const k = { subscriptionId: "sub_1", fromPriceId: "p1", fromQuantity: 2, toPriceId: "p1", toQuantity: 3 };
    expect(subscriptionUpdateIdempotencyKey({ ...k, requestId: "req_a" })).not.toBe(subscriptionUpdateIdempotencyKey({ ...k, requestId: "req_c" }));
  });
});

describe("isLiveSubscriptionStatus", () => {
  it("sigue cobrando: activa, prueba, impago, pausada, incompleta", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) expect(isLiveSubscriptionStatus(s)).toBe(true);
  });
  it("terminada: cancelada o incompleta vencida", () => {
    expect(isLiveSubscriptionStatus("canceled")).toBe(false);
    expect(isLiveSubscriptionStatus("incomplete_expired")).toBe(false);
  });
});

describe("checkoutSessionParams", () => {
  const p = checkoutSessionParams({ customerId: "cus_1", organizationId: "org_1", priceId: "price_pro", seats: 3, trialEnd: null, automaticTax: false, successUrl: "https://a/ok", cancelUrl: "https://a/no" });
  it("español, dirección obligatoria, RFC y datos guardados en el cliente", () => {
    expect(p).toMatchObject({
      mode: "subscription",
      locale: "es",
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      line_items: [{ price: "price_pro", quantity: 3 }],
      subscription_data: { metadata: { organizationId: "org_1" } },
    });
  });
  it("Stripe Tax apagado por defecto y encendido con el interruptor", () => {
    expect(p.automatic_tax).toEqual({ enabled: false });
    expect(checkoutSessionParams({ customerId: "c", organizationId: "o", priceId: "p", seats: 1, trialEnd: 123, automaticTax: true, successUrl: "s", cancelUrl: "c" })).toMatchObject({ automatic_tax: { enabled: true }, subscription_data: { trial_end: 123 } });
  });
  it("sin trial_end cuando no hay prueba", () => expect(p.subscription_data).not.toHaveProperty("trial_end"));
});
