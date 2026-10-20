import { beforeEach, describe, expect, it, vi } from "vitest";

// Sin Stripe ni base reales: se simulan prisma, la configuración y el SDK.
const db = vi.hoisted(() => ({
  org: null as null | Record<string, unknown>,
  users: 0,
  invites: 0,
  wa: 0,
  update: vi.fn(),
}));
const stripeApi = vi.hoisted(() => ({
  retrieve: vi.fn(),
  update: vi.fn(),
  pricesList: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(async () => db.org),
      update: vi.fn(async (args: unknown) => db.update(args)),
    },
    user: { count: vi.fn(async () => db.users) },
    authToken: { count: vi.fn(async () => db.invites) },
    wAAccount: { count: vi.fn(async () => db.wa) },
    channelAccount: { count: vi.fn(async () => 0) },
    contact: { count: vi.fn(async () => 0) },
    automation: { count: vi.fn(async () => 0) },
    apiKey: { count: vi.fn(async () => 0) },
    webhookEndpoint: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings: vi.fn(async () => ({ stripeSecretKey: "sk_test", stripePriceBusiness: "price_basic", stripePricePro: "price_pro", stripeWebhookSecret: "whsec" })),
}));
vi.mock("../notify", () => ({ notifyBillingTransition: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { retrieve: stripeApi.retrieve, update: stripeApi.update };
    prices = { list: stripeApi.pricesList };
  },
}));

import { evaluatePlanLimit, invalidateOrgBilling } from "../gates";
import { invalidatePriceCache, isStripeConfigured, priceIdFor, syncSubscription } from "../stripe";
import { applyPlanChange } from "../seats";

const ORG = "org_1";
function subscription(quantity: number, price = "price_pro") {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { organizationId: ORG },
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ id: "si_1", quantity, current_period_end: 1790000000, price: { id: price, currency: "mxn" } }] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePriceCache();
  // Por defecto no hay precios con lookup_key: se usan los de /plataforma.
  stripeApi.pricesList.mockResolvedValue({ data: [] });
  invalidateOrgBilling(ORG);
  db.users = 1;
  db.invites = 0;
  db.wa = 0;
  db.org = {
    id: ORG, name: "Vamex", plan: "PRO", status: "ACTIVE", isInternal: false, seatQuantity: 3,
    trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null,
    aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: new Date(), stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
  };
});

describe("candado de asientos (evaluatePlanLimit seats)", () => {
  it("con asientos libres deja agregar", async () => {
    db.users = 2;
    expect(await evaluatePlanLimit(ORG, "seats")).toBeNull();
  });
  it("las invitaciones pendientes ocupan asiento", async () => {
    db.users = 2;
    db.invites = 1;
    const r = await evaluatePlanLimit(ORG, "seats");
    expect(r).toMatchObject({ limit: "seats", current: 3, max: 3 });
    expect(r?.message).toMatch(/Agrega un asiento/);
  });
  it("prueba: tope de 3 ejecutivos aunque haya quantity mayor", async () => {
    db.org = { ...db.org!, status: "TRIALING", trialEndsAt: new Date(Date.now() + 86400000), seatQuantity: 10 };
    db.users = 3;
    const r = await evaluatePlanLimit(ORG, "seats");
    expect(r).toMatchObject({ max: 3 });
    expect(r?.message).toMatch(/prueba gratis incluye hasta 3/);
  });
  it("WhatsApp: 1 número por asiento ocupado", async () => {
    db.users = 3;
    db.wa = 3;
    expect(await evaluatePlanLimit(ORG, "whatsapp")).toMatchObject({ limit: "whatsapp", max: 3 });
    db.wa = 2;
    expect(await evaluatePlanLimit(ORG, "whatsapp")).toBeNull();
  });
});

describe("syncSubscription: la quantity de Stripe pasa a seatQuantity", () => {
  it("customer.subscription.updated con 5 asientos", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(5));
    await syncSubscription("sub_1");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG }, data: expect.objectContaining({ seatQuantity: 5, plan: "PRO", status: "ACTIVE" }) }));
  });
});

describe("applyPlanChange (agregar/quitar asientos con prorrateo)", () => {
  it("agregar un asiento se cobra de inmediato (always_invoice, pendiente si el pago falla) con llave de idempotencia", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({});
    const r = await applyPlanChange(ORG, { plan: "PRO", seats: 4, confirm: false });
    expect(r).toEqual({ ok: true, changed: true });
    expect(stripeApi.update).toHaveBeenCalledWith(
      "sub_1",
      { items: [{ id: "si_1", price: "price_pro", quantity: 4 }], proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete" },
      { idempotencyKey: "sub-update:sub_1:price_prox3->price_prox4" }
    );
  });
  it("quitar un asiento deja el crédito para la siguiente factura (create_prorations)", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({});
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 2, confirm: true })).toEqual({ ok: true, changed: true });
    expect(stripeApi.update).toHaveBeenCalledWith(
      "sub_1",
      { items: [{ id: "si_1", price: "price_pro", quantity: 2 }], proration_behavior: "create_prorations" },
      { idempotencyKey: "sub-update:sub_1:price_prox3->price_prox2" }
    );
  });
  it("bajar de Pro a Negocio no cobra de inmediato", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({});
    await applyPlanChange(ORG, { plan: "BUSINESS", seats: 3, confirm: true });
    expect(stripeApi.update.mock.calls[0][1]).toMatchObject({ items: [{ price: "price_basic" }], proration_behavior: "create_prorations" });
  });
  it("no deja bajar de los ejecutivos activos", async () => {
    db.users = 3;
    const r = await applyPlanChange(ORG, { plan: "PRO", seats: 2, confirm: true });
    expect(r).toMatchObject({ ok: false, code: "blocked", status: 409 });
    expect(stripeApi.update).not.toHaveBeenCalled();
  });
  it("sin suscripción manda a Checkout", async () => {
    db.org = { ...db.org!, stripeSubscriptionId: null };
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 2, confirm: false })).toMatchObject({ ok: false, code: "no_subscription" });
  });
  it("mismo plan y asientos: no llama a Stripe", async () => {
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 3, confirm: false })).toEqual({ ok: true, changed: false });
    expect(stripeApi.update).not.toHaveBeenCalled();
  });
});

describe("precios por lookup_key", () => {
  it("usa el precio con lookup_key y cae a /plataforma si falta", async () => {
    stripeApi.pricesList.mockResolvedValue({ data: [{ id: "price_lk_pro", lookup_key: "colibly_pro_monthly", currency: "mxn", recurring: { interval: "month" } }] });
    expect(await priceIdFor("PRO")).toBe("price_lk_pro");
    expect(await priceIdFor("BUSINESS")).toBe("price_basic");
    expect(stripeApi.pricesList).toHaveBeenCalledTimes(1); // en caché
  });
  it("si Stripe falla, usa los price ids guardados", async () => {
    stripeApi.pricesList.mockRejectedValue(new Error("red"));
    expect(await priceIdFor("PRO")).toBe("price_pro");
  });
  it("configurado solo si cada plan tiene precio (lookup_key o /plataforma)", async () => {
    // El mock de /plataforma no trae Esencial.
    expect(await isStripeConfigured()).toBe(false);
    invalidatePriceCache();
    stripeApi.pricesList.mockResolvedValue({ data: [{ id: "price_lk_ess", lookup_key: "colibly_esencial_monthly", currency: "mxn", recurring: { interval: "month" } }] });
    expect(await isStripeConfigured()).toBe(true);
  });
  it("sincroniza el plan por la lookup_key del precio", async () => {
    stripeApi.retrieve.mockResolvedValue({ ...subscription(2, "price_desconocido"), items: { data: [{ id: "si_1", quantity: 2, current_period_end: 1790000000, price: { id: "price_desconocido", currency: "mxn", lookup_key: "colibly_negocio_monthly" } }] } });
    await syncSubscription("sub_1");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: "BUSINESS", seatQuantity: 2 }) }));
  });
});
