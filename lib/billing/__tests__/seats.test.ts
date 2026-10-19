import { describe, expect, it } from "vitest";
import { aiCreditLimit, deriveFromSubscription, planChangeImpact, planLimits, seatCap, type SeatUsage } from "../state";
import { limitsForSeats, MAX_SEATS, maxSeatsFor, monthlyTotalMxn, PLANS, PRICE_TAX_NOTE, TRIAL_MAX_SEATS, TRIAL_POOL } from "../plans";

const usage = (over: Partial<SeatUsage> = {}): SeatUsage => ({
  seats: 1, whatsapp: 0, telegram: 0, messenger: 0, instagram: 0, webchat: 0, contacts: 0, activeAutomations: 0, apiKeys: 0, webhooks: 0, ...over,
});

describe("catálogo por asiento (plans.ts)", () => {
  it("precios en MXN por ejecutivo", () => {
    expect(PLANS.ESSENTIAL.pricePerSeatMxn).toBe(99);
    expect(PLANS.BUSINESS.pricePerSeatMxn).toBe(199);
    expect(PLANS.BUSINESS.name).toBe("Negocio");
    expect(PLANS.PRO.pricePerSeatMxn).toBe(349);
    expect(PLANS.PRO.badge).toBe("Más popular");
    expect(monthlyTotalMxn(PLANS.PRO, 4)).toBe(1396);
  });
  it("sin leyenda fiscal mientras no se facture", () => expect(PRICE_TAX_NOTE).toBeNull());
  it("tope de 100 ejecutivos desde la app", () => expect(MAX_SEATS).toBe(100));
});

describe("seatCap", () => {
  it("prueba: tope de la prueba aunque se haya pagado menos", () =>
    expect(seatCap({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toBe(TRIAL_MAX_SEATS));
  it("activa: la quantity de Stripe", () => expect(seatCap({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 7 })).toBe(7));
  it("nunca menos de 1", () => expect(seatCap({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 0 })).toBe(1));
  it("cancelada conserva su último número", () => expect(seatCap({ plan: "PRO", isInternal: false, status: "CANCELED", seatQuantity: 4 })).toBe(4));
  it("interna: sin tope", () => expect(seatCap({ plan: "PRO", isInternal: true, status: "ACTIVE", seatQuantity: 1 })).toBe(Infinity));
});

describe("límites en bolsa (por asiento × asientos)", () => {
  it("Negocio con 4 ejecutivos", () =>
    expect(planLimits({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 4 })).toEqual({
      seats: 4, whatsapp: 4, telegram: 4, messenger: 4, instagram: 4, contacts: 8000, aiCreditsPerMonth: 1200, activeAutomations: 5, apiAccess: false, aiAccess: true, webchat: true,
    }));
  it("Pro con 2 ejecutivos", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 2 })).toMatchObject({
      seats: 2, whatsapp: 2, telegram: 2, messenger: 2, instagram: 2, contacts: 10000, aiCreditsPerMonth: 2000, activeAutomations: Infinity, apiAccess: true,
    }));
  it("prueba: Pro con TRIAL_MAX_SEATS ejecutivos y bolsa plana (no se multiplica)", () => {
    expect(TRIAL_POOL).toEqual({ contacts: 5000, aiCreditsPerMonth: 1000 });
    expect(planLimits({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 })).toMatchObject({
      seats: TRIAL_MAX_SEATS, whatsapp: TRIAL_MAX_SEATS, telegram: TRIAL_MAX_SEATS, messenger: TRIAL_MAX_SEATS, instagram: TRIAL_MAX_SEATS,
      contacts: 5000, aiCreditsPerMonth: 1000,
    });
  });
  it("prueba: créditos de IA = bolsa plana + bono", () =>
    expect(aiCreditLimit({ plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 3, aiCreditsBonus: 50 })).toBe(1050));
  it("al pagar, la bolsa vuelve a ser por asiento", () =>
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 3 })).toMatchObject({ contacts: 15000, aiCreditsPerMonth: 3000 }));
  it("créditos de IA: bolsa + bono", () =>
    expect(aiCreditLimit({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 3, aiCreditsBonus: 100 })).toBe(1000));
  it("limitsForSeats redondea hacia abajo y respeta el mínimo", () => {
    expect(limitsForSeats(PLANS.BUSINESS, 2.9).seats).toBe(2);
    expect(limitsForSeats(PLANS.BUSINESS, 0).seats).toBe(1);
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

describe("planChangeImpact (reducción de asientos y Pro → Negocio → Esencial)", () => {
  it("bloquea bajar de los asientos ocupados (incluye invitaciones)", () => {
    const r = planChangeImpact("PRO", 2, usage({ seats: 3 }));
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatch(/ocupa 3 asientos/);
  });
  it("bloquea tener más números de WhatsApp que asientos", () =>
    expect(planChangeImpact("PRO", 2, usage({ seats: 2, whatsapp: 3 })).blockers[0]).toMatch(/números de WhatsApp/));
  it.each(["telegram", "messenger", "instagram"] as const)("bloquea tener más cuentas de %s que asientos (en Negocio y en Pro)", (ch) => {
    expect(planChangeImpact("PRO", 2, usage({ seats: 2, [ch]: 3 })).blockers[0]).toMatch(/cada ejecutivo conecta 1/);
    expect(planChangeImpact("BUSINESS", 2, usage({ seats: 2, [ch]: 3 })).blockers[0]).toMatch(/Desconecta cuentas de/);
  });
  it("1 cuenta de cada tipo por ejecutivo cabe aunque sean 3 tipos", () =>
    expect(planChangeImpact("BUSINESS", 1, usage({ telegram: 1, messenger: 1, instagram: 1 }))).toEqual({ blockers: [], warnings: [] }));
  it("Negocio: bloquea con más de 5 automatizaciones activas", () =>
    expect(planChangeImpact("BUSINESS", 3, usage({ seats: 3, activeAutomations: 6 })).blockers[0]).toMatch(/automatizaciones activas/));
  it("Negocio: avisa que la API y los webhooks dejan de funcionar", () => {
    const r = planChangeImpact("BUSINESS", 3, usage({ seats: 3, apiKeys: 2, webhooks: 1 }));
    expect(r.blockers).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/API y los webhooks/);
  });
  it("avisa contactos por encima del nuevo tope (se conservan)", () =>
    expect(planChangeImpact("BUSINESS", 1, usage({ contacts: 2500 })).warnings[0]).toMatch(/se conservan todos/));
  it("agregar asientos no tiene bloqueos ni avisos", () => expect(planChangeImpact("PRO", 5, usage({ seats: 3, whatsapp: 3 }))).toEqual({ blockers: [], warnings: [] }));
  it("asientos inválidos", () => expect(planChangeImpact("PRO", 0, usage()).blockers).toHaveLength(1));
});

describe("Esencial", () => {
  const ess = { plan: "ESSENTIAL" as const, isInternal: false, status: "ACTIVE" as const, seatQuantity: 2 };
  it("solo WhatsApp, 500 contactos por ejecutivo, sin IA, 1 automatización, sin API ni chat web", () =>
    expect(planLimits(ess)).toEqual({
      seats: 2, whatsapp: 2, telegram: 0, messenger: 0, instagram: 0, contacts: 1000, aiCreditsPerMonth: 0, activeAutomations: 1, apiAccess: false, aiAccess: false, webchat: false,
    }));
  it("sin créditos de IA aunque haya bono", () => expect(aiCreditLimit({ ...ess, aiCreditsBonus: 500 })).toBe(0));
  it("tope de 3 ejecutivos", () => {
    expect(seatCap({ ...ess, seatQuantity: 7 })).toBe(3);
    expect(limitsForSeats(PLANS.ESSENTIAL, 10).seats).toBe(3);
    expect(maxSeatsFor(PLANS.ESSENTIAL)).toBe(3);
    expect(maxSeatsFor(PLANS.PRO)).toBe(MAX_SEATS);
  });
  it("bloquea pasar a Esencial con más de 3 ejecutivos", () =>
    expect(planChangeImpact("ESSENTIAL", 4, usage({ seats: 4 })).blockers.join(" ")).toMatch(/hasta 3 ejecutivos/));
  it("bloquea pasar a Esencial con Telegram o chat web conectados", () => {
    expect(planChangeImpact("ESSENTIAL", 1, usage({ telegram: 1 })).blockers.join(" ")).toMatch(/no incluye/);
    expect(planChangeImpact("ESSENTIAL", 1, usage({ webchat: 1 })).blockers.join(" ")).toMatch(/chat web/i);
  });
  it("bloquea con más de 1 automatización activa (singular)", () =>
    expect(planChangeImpact("ESSENTIAL", 1, usage({ activeAutomations: 2 })).blockers.join(" ")).toMatch(/1 automatización activa/));
  it("avisa que la IA deja de funcionar", () =>
    expect(planChangeImpact("ESSENTIAL", 1, usage()).warnings.join(" ")).toMatch(/no incluye IA/));
});
