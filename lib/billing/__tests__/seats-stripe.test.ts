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
  invoicesRetrieve: vi.fn(),
  sessionsList: vi.fn(),
  sessionsExpire: vi.fn(),
}));
const mail = vi.hoisted(() => ({ send: vi.fn() }));

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
    pipeline: { count: vi.fn(async () => 0) },
    contactCustomFieldDefinition: { count: vi.fn(async () => 0) },
    wABot: { count: vi.fn(async () => 0) },
    apiKey: { count: vi.fn(async () => 0) },
    webhookEndpoint: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings: vi.fn(async () => ({ stripeSecretKey: "sk_test", stripePriceBusiness: "price_basic", stripePricePro: "price_pro", stripeWebhookSecret: "whsec" })),
}));
vi.mock("../notify", () => ({ notifyBillingTransition: vi.fn() }));
vi.mock("@/lib/platform-admin", () => ({ listPlatformAdminEmails: () => ["ops@colibly.test"] }));
vi.mock("@/lib/email/mailer", () => ({ sendEmailSafely: mail.send }));
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { retrieve: stripeApi.retrieve, update: stripeApi.update };
    prices = { list: stripeApi.pricesList };
    invoices = { retrieve: stripeApi.invoicesRetrieve };
    checkout = { sessions: { list: stripeApi.sessionsList, expire: stripeApi.sessionsExpire } };
  },
}));

import { evaluatePlanLimit, invalidateOrgBilling } from "../gates";
import { expireOtherOpenCheckouts, invalidatePriceCache, isStripeConfigured, priceIdFor, syncSubscription } from "../stripe";
import { applyPlanChange } from "../seats";

const ORG = "org_1";
function subscription(quantity: number, price = "price_pro", id = "sub_1", created = 1_780_000_000) {
  return {
    id,
    created,
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
  it("WhatsApp en Básico: 1 número por usuario", async () => {
    db.org = { ...db.org!, plan: "ESSENTIAL" };
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
      { idempotencyKey: expect.stringMatching(/^sub-update:sub_1:price_prox3->price_prox4:[0-9a-f-]{36}$/) }
    );
  });
  it("quitar un asiento deja el crédito para la siguiente factura (create_prorations)", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({});
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 2, confirm: true })).toEqual({ ok: true, changed: true });
    expect(stripeApi.update).toHaveBeenCalledWith(
      "sub_1",
      { items: [{ id: "si_1", price: "price_pro", quantity: 2 }], proration_behavior: "create_prorations" },
      { idempotencyKey: expect.stringMatching(/^sub-update:sub_1:price_prox3->price_prox2:/) }
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
  it("repetir el mismo cambio usa otra llave (Stripe no devuelve la respuesta guardada)", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({});
    await applyPlanChange(ORG, { plan: "PRO", seats: 4, confirm: false });
    await applyPlanChange(ORG, { plan: "PRO", seats: 4, confirm: false });
    expect(stripeApi.update.mock.calls[0][2].idempotencyKey).not.toBe(stripeApi.update.mock.calls[1][2].idempotencyKey);
  });
  it("si Stripe no pudo cobrar la subida, no dice que cambió y devuelve la factura por pagar", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({ pending_update: { expires_at: 1_790_000_000 }, latest_invoice: "in_1" });
    stripeApi.invoicesRetrieve.mockResolvedValue({ hosted_invoice_url: "https://invoice.stripe.com/i/in_1" });
    const r = await applyPlanChange(ORG, { plan: "PRO", seats: 4, confirm: false });
    expect(r).toMatchObject({ ok: false, status: 402, code: "payment_pending", invoiceUrl: "https://invoice.stripe.com/i/in_1" });
    expect(stripeApi.invoicesRetrieve).toHaveBeenCalledWith("in_1");
  });
  it("cambio pendiente sin factura legible: sigue avisando, sin enlace", async () => {
    stripeApi.retrieve.mockResolvedValue(subscription(3));
    stripeApi.update.mockResolvedValue({ pending_update: { expires_at: 1_790_000_000 }, latest_invoice: "in_1" });
    stripeApi.invoicesRetrieve.mockRejectedValue(new Error("red"));
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 4, confirm: false })).toMatchObject({ code: "payment_pending", invoiceUrl: null });
  });
  it("mismo plan y asientos: no llama a Stripe", async () => {
    expect(await applyPlanChange(ORG, { plan: "PRO", seats: 3, confirm: false })).toEqual({ ok: true, changed: false });
    expect(stripeApi.update).not.toHaveBeenCalled();
  });
});

describe("precios por plan", () => {
  it("usa el price id guardado y cae a la lookup_key si falta", async () => {
    stripeApi.pricesList.mockResolvedValue({ data: [{ id: "price_lk_ess", lookup_key: "colibly_esencial_monthly", currency: "mxn", recurring: { interval: "month" } }] });
    expect(await priceIdFor("PRO")).toBe("price_pro");
    expect(await priceIdFor("BUSINESS")).toBe("price_basic");
    expect(await priceIdFor("ESSENTIAL")).toBe("price_lk_ess");
    expect(stripeApi.pricesList).toHaveBeenCalledTimes(1); // solo para el plan sin id
  });
  it("con id guardado no consulta Stripe", async () => {
    stripeApi.pricesList.mockRejectedValue(new Error("red"));
    expect(await priceIdFor("PRO")).toBe("price_pro");
    expect(stripeApi.pricesList).not.toHaveBeenCalled();
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

describe("suscripción duplicada", () => {
  it("una nueva viva junto a la anterior viva: gana la nueva y se avisa al operador", async () => {
    stripeApi.retrieve.mockImplementation(async (id: string) =>
      id === "sub_2" ? subscription(4, "price_pro", "sub_2", 1_790_000_000) : subscription(3, "price_pro", "sub_1", 1_780_000_000)
    );
    await syncSubscription("sub_2");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: "sub_2", seatQuantity: 4 }) }));
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "ops@colibly.test", subject: "Suscripción duplicada en Stripe" });
  });
  it("un evento de la anterior ya no pisa a la vigente más reciente, pero vuelve a avisar", async () => {
    db.org = { ...db.org!, stripeSubscriptionId: "sub_2" };
    stripeApi.retrieve.mockImplementation(async (id: string) =>
      id === "sub_2" ? subscription(4, "price_pro", "sub_2", 1_790_000_000) : subscription(3, "price_pro", "sub_1", 1_780_000_000)
    );
    await syncSubscription("sub_1");
    expect(db.update).not.toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
  it("si la anterior ya está cancelada, no hay aviso", async () => {
    stripeApi.retrieve.mockImplementation(async (id: string) =>
      id === "sub_2" ? subscription(4, "price_pro", "sub_2", 1_790_000_000) : { ...subscription(3), status: "canceled" }
    );
    await syncSubscription("sub_2");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: "sub_2" }) }));
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe("expireOtherOpenCheckouts", () => {
  it("vence las demás sesiones abiertas del cliente y deja la actual", async () => {
    stripeApi.sessionsList.mockResolvedValue({ data: [{ id: "cs_viejo" }, { id: "cs_actual" }] });
    await expireOtherOpenCheckouts("cus_1", "cs_actual");
    expect(stripeApi.sessionsList).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 20 });
    expect(stripeApi.sessionsExpire).toHaveBeenCalledTimes(1);
    expect(stripeApi.sessionsExpire).toHaveBeenCalledWith("cs_viejo");
  });
  it("si Stripe falla no rompe el checkout", async () => {
    stripeApi.sessionsList.mockRejectedValue(new Error("red"));
    await expect(expireOtherOpenCheckouts("cus_1", "cs_actual")).resolves.toBeUndefined();
  });
});
