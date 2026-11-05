import { describe, expect, it } from "vitest";
import { aiCreditLimit, deriveFromSubscription, planChangeImpact, planLimits, seatCap, type SeatUsage } from "../state";
import { limitsForSeats, MAX_SEATS, maxSeatsFor, monthlyTotalMxn, PLANS, PRICE_TAX_NOTE, TRIAL_MAX_SEATS } from "../plans";

const usage = (over: Partial<SeatUsage> = {}): SeatUsage => ({
  seats: 1, whatsapp: 0, telegram: 0, messenger: 0, instagram: 0, webchat: 0, contacts: 0, activeLeads: 0, activeAutomations: 0, funnels: 0, customFields: 0, aiAgents: 0, apiKeys: 0, webhooks: 0, ...over,
});

describe("catálogo por usuario (plans.ts)", () => {
  it("precios de la oferta pública", () => {
    expect(PLANS.ESSENTIAL.pricePerSeatMxn).toBe(59);
    expect(PLANS.ESSENTIAL.name).toBe("Básico");
    expect(PLANS.BUSINESS.pricePerSeatMxn).toBe(89);
    expect(PLANS.BUSINESS.name).toBe("Avanzado");
    expect(PLANS.PRO.pricePerSeatMxn).toBe(149);
    expect(PLANS.BUSINESS.badge).toBe("Recomendado");
    expect(PLANS.PRO.badge).toBeNull();
    expect(monthlyTotalMxn(PLANS.PRO, 4)).toBe(596);
  });
  it("sin leyenda fiscal mientras no se facture", () => expect(PRICE_TAX_NOTE).toBeNull());
  it("tope de 100 usuarios desde la app", () => expect(MAX_SEATS).toBe(100));
});

describe("seatCap", () => {
  it("prueba: tope de la prueba aunque se haya pagado menos", () =>
    expect(seatCap({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toBe(TRIAL_MAX_SEATS));
  it("activa: la quantity de Stripe", () => expect(seatCap({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 7 })).toBe(7));
  it("nunca menos de 1", () => expect(seatCap({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 0 })).toBe(1));
  it("cancelada conserva su último número", () => expect(seatCap({ plan: "PRO", isInternal: false, status: "CANCELED", seatQuantity: 4 })).toBe(4));
  it("interna: sin tope", () => expect(seatCap({ plan: "PRO", isInternal: true, status: "ACTIVE", seatQuantity: 1 })).toBe(Infinity));
});

describe("límites en bolsa (por usuario)", () => {
  it("Avanzado con 4 usuarios: 3 canales incluidos + 1 por cada extra", () =>
    expect(planLimits({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 4 })).toEqual({
      seats: 4,
      whatsapp: 6,
      telegram: Infinity,
      messenger: Infinity,
      instagram: 6,
      contacts: 100_000,
      activeLeads: 20_000,
      aiCreditsPerMonth: 5_000,
      activeAutomations: Infinity,
      apiAccess: true,
      webhooks: true,
      campaigns: true,
      bots: true,
      leadScoring: false,
      aiAccess: true,
      webchat: true,
      funnels: 50,
      customFields: 200,
      aiAgents: 3,
    }));
  it("Pro con 2 usuarios no capa canales", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 2 })).toMatchObject({
      seats: 2, whatsapp: Infinity, instagram: Infinity, contacts: 100_000, activeLeads: 20_000, aiCreditsPerMonth: 4_500, leadScoring: true,
    }));
  it("prueba: Pro × TRIAL_MAX_SEATS, sí se multiplica", () => {
    expect(planLimits({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toMatchObject({
      seats: TRIAL_MAX_SEATS,
      whatsapp: Infinity,
      contacts: 50_000 * TRIAL_MAX_SEATS,
      activeLeads: 10_000 * TRIAL_MAX_SEATS,
      aiCreditsPerMonth: 2_250 * TRIAL_MAX_SEATS,
    });
  });
  it("prueba: créditos de IA = bolsa de Pro × usuarios de la prueba + bono", () =>
    expect(aiCreditLimit({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 3, aiCreditsBonus: 50 })).toBe(2_250 * TRIAL_MAX_SEATS + 50));
  it("al pagar, la bolsa es por los usuarios cobrados", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 3 })).toMatchObject({ contacts: 150_000, aiCreditsPerMonth: 6_750 }));
  it("créditos de IA: bolsa + bono", () =>
    expect(aiCreditLimit({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 3, aiCreditsBonus: 100 })).toBe(1_250 * 3 + 100));
  it("limitsForSeats redondea hacia abajo y respeta el mínimo", () => {
    expect(limitsForSeats(PLANS.BUSINESS, 2.9).seats).toBe(2);
    expect(limitsForSeats(PLANS.BUSINESS, 0).seats).toBe(1);
    expect(limitsForSeats(PLANS.BUSINESS, 1).whatsapp).toBe(3);
    expect(limitsForSeats(PLANS.BUSINESS, 2).whatsapp).toBe(4);
  });
});

describe("sincronización de la quantity (webhook)", () => {
  const base = { status: "ACTIVE" as const, graceEndsAt: null, canceledAt: null };
  const prices = (id: string) => (id === "price_pro" ? ("PRO" as const) : null);
  it("customer.subscription.updated con quantity 6 → seatQuantity 6", () =>
    expect(deriveFromSubscription({ status: "active", priceId: "price_pro", quantity: 6, currentPeriodEnd: 1790000000, cancelAtPeriodEnd: false }, base, new Date(), prices)).toMatchObject({ plan: "PRO", seatQuantity: 6 }));
  it("sin quantity no toca los asientos", () =>
    expect(deriveFromSubscription({ status: "active", priceId: "price_pro", quantity: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }, base, new Date(), prices).seatQuantity).toBeUndefined());
});

describe("planChangeImpact", () => {
  it("bloquea bajar de los asientos ocupados (incluye invitaciones)", () => {
    const r = planChangeImpact("PRO", 2, usage({ seats: 3 }));
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatch(/ocupa 3 asientos/);
  });
  it("bloquea tener más números de WhatsApp que el cupo", () =>
    expect(planChangeImpact("ESSENTIAL", 2, usage({ seats: 2, whatsapp: 3 })).blockers[0]).toMatch(/números de WhatsApp/));
  it("Avanzado con 1 usuario cabe con 3 números y no con 4", () => {
    expect(planChangeImpact("BUSINESS", 1, usage({ whatsapp: 3 })).blockers).toEqual([]);
    expect(planChangeImpact("BUSINESS", 1, usage({ whatsapp: 4 })).blockers[0]).toMatch(/permite 3/);
  });
  it("Básico no incluye automatizaciones activas", () =>
    expect(planChangeImpact("ESSENTIAL", 1, usage({ activeAutomations: 1 })).blockers[0]).toMatch(/no incluye automatizaciones/));
  it("bajar a Básico avisa bots, calificación y difusiones", () => {
    const r = planChangeImpact("ESSENTIAL", 1, usage());
    expect(r.blockers).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/bots/);
    expect(r.warnings.join(" ")).toMatch(/calificación/);
    expect(r.warnings.join(" ")).toMatch(/difusiones/);
  });
  it("bajar a Avanzado avisa que la calificación deja de correr", () =>
    expect(planChangeImpact("BUSINESS", 1, usage()).warnings.join(" ")).toMatch(/calificación/));
  it("avisa contactos y leads por encima del nuevo tope (se conservan)", () => {
    const r = planChangeImpact("ESSENTIAL", 1, usage({ contacts: 20_000, activeLeads: 4_000 }));
    expect(r.warnings.join(" ")).toMatch(/se conservan todos/);
    expect(r.warnings.join(" ")).toMatch(/leads activos/);
  });
  it("agregar usuarios en Pro no tiene bloqueos ni avisos", () => expect(planChangeImpact("PRO", 5, usage({ seats: 3, whatsapp: 3 }))).toEqual({ blockers: [], warnings: [] }));
  it("asientos inválidos", () => expect(planChangeImpact("PRO", 0, usage()).blockers).toHaveLength(1));
});

describe("Básico", () => {
  const basic = { plan: "ESSENTIAL" as const, isInternal: false, status: "ACTIVE" as const, seatQuantity: 2 };
  it("1 WhatsApp y 1 Instagram por usuario, IA de asistencia, sin bots ni difusiones", () =>
    expect(planLimits(basic)).toMatchObject({
      seats: 2,
      whatsapp: 2,
      instagram: 2,
      telegram: Infinity,
      contacts: 25_000,
      activeLeads: 5_000,
      aiCreditsPerMonth: 1_500,
      activeAutomations: 0,
      apiAccess: true,
      webhooks: false,
      campaigns: false,
      bots: false,
      leadScoring: false,
      aiAccess: true,
      webchat: true,
      funnels: 50,
      customFields: 100,
      aiAgents: 0,
    }));
  it("el tope de usuarios es el de la app", () => {
    expect(maxSeatsFor(PLANS.ESSENTIAL)).toBe(MAX_SEATS);
    expect(maxSeatsFor(PLANS.PRO)).toBe(MAX_SEATS);
  });
});
