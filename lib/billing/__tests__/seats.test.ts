import { describe, expect, it } from "vitest";
import { aiCreditLimit, deriveFromSubscription, planChangeImpact, planLimits, seatCap, type SeatUsage } from "../state";
import { limitsForSeats, monthlyTotalMxn, PLANS, PRICE_TAX_NOTE, TRIAL_MAX_SEATS } from "../plans";

const usage = (over: Partial<SeatUsage> = {}): SeatUsage => ({
  seats: 1, whatsapp: 0, channels: 0, contacts: 0, activeAutomations: 0, apiKeys: 0, webhooks: 0, ...over,
});

describe("catálogo por asiento (plans.ts)", () => {
  it("precios en MXN por ejecutivo", () => {
    expect(PLANS.BASIC.pricePerSeatMxn).toBe(149);
    expect(PLANS.PRO.pricePerSeatMxn).toBe(299);
    expect(monthlyTotalMxn(PLANS.PRO, 4)).toBe(1196);
  });
  it("sin leyenda fiscal mientras no se facture", () => expect(PRICE_TAX_NOTE).toBeNull());
});

describe("seatCap", () => {
  it("prueba: tope de la prueba aunque se haya pagado menos", () =>
    expect(seatCap({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toBe(TRIAL_MAX_SEATS));
  it("activa: la quantity de Stripe", () => expect(seatCap({ plan: "BASIC", isInternal: false, status: "ACTIVE", seatQuantity: 7 })).toBe(7));
  it("nunca menos de 1", () => expect(seatCap({ plan: "BASIC", isInternal: false, status: "ACTIVE", seatQuantity: 0 })).toBe(1));
  it("cancelada conserva su último número", () => expect(seatCap({ plan: "PRO", isInternal: false, status: "CANCELED", seatQuantity: 4 })).toBe(4));
  it("interna: sin tope", () => expect(seatCap({ plan: "PRO", isInternal: true, status: "ACTIVE", seatQuantity: 1 })).toBe(Infinity));
});

describe("límites en bolsa (por asiento × asientos)", () => {
  it("Básico con 4 ejecutivos", () =>
    expect(planLimits({ plan: "BASIC", isInternal: false, status: "ACTIVE", seatQuantity: 4 })).toEqual({
      seats: 4, whatsapp: 4, channels: 1, contacts: 4000, aiCreditsPerMonth: 1200, activeAutomations: 5, apiAccess: false,
    }));
  it("Pro con 2 ejecutivos", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 2 })).toMatchObject({
      seats: 2, whatsapp: 2, contacts: 10000, aiCreditsPerMonth: 2000, activeAutomations: Infinity, apiAccess: true,
    }));
  it("prueba: Pro con TRIAL_MAX_SEATS ejecutivos", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toMatchObject({
      seats: TRIAL_MAX_SEATS, whatsapp: TRIAL_MAX_SEATS, contacts: 5000 * TRIAL_MAX_SEATS, aiCreditsPerMonth: 1000 * TRIAL_MAX_SEATS,
    }));
  it("créditos de IA: bolsa + bono", () =>
    expect(aiCreditLimit({ plan: "BASIC", isInternal: false, status: "ACTIVE", seatQuantity: 3, aiCreditsBonus: 100 })).toBe(1000));
  it("limitsForSeats redondea hacia abajo y respeta el mínimo", () => {
    expect(limitsForSeats(PLANS.BASIC, 2.9).seats).toBe(2);
    expect(limitsForSeats(PLANS.BASIC, 0).seats).toBe(1);
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

describe("planChangeImpact (reducción de asientos y Pro → Básico)", () => {
  it("bloquea bajar de los asientos ocupados (incluye invitaciones)", () => {
    const r = planChangeImpact("PRO", 2, usage({ seats: 3 }));
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatch(/ocupa 3 asientos/);
  });
  it("bloquea tener más números de WhatsApp que asientos", () =>
    expect(planChangeImpact("PRO", 2, usage({ seats: 2, whatsapp: 3 })).blockers[0]).toMatch(/números de WhatsApp/));
  it("Básico: bloquea con más de 5 automatizaciones activas", () =>
    expect(planChangeImpact("BASIC", 3, usage({ seats: 3, activeAutomations: 6 })).blockers[0]).toMatch(/automatizaciones activas/));
  it("Básico: avisa que la API y los webhooks dejan de funcionar", () => {
    const r = planChangeImpact("BASIC", 3, usage({ seats: 3, apiKeys: 2, webhooks: 1 }));
    expect(r.blockers).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/API y los webhooks/);
  });
  it("avisa contactos por encima del nuevo tope (se conservan)", () =>
    expect(planChangeImpact("BASIC", 1, usage({ contacts: 1500 })).warnings[0]).toMatch(/se conservan todos/));
  it("agregar asientos no tiene bloqueos ni avisos", () => expect(planChangeImpact("PRO", 5, usage({ seats: 3, whatsapp: 3 }))).toEqual({ blockers: [], warnings: [] }));
  it("asientos inválidos", () => expect(planChangeImpact("PRO", 0, usage()).blockers).toHaveLength(1));
});
