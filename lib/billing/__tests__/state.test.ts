import { describe, expect, it } from "vitest";
import { accessMode, billingNotice, deriveFromSubscription, planLimits, tickTransition, type BillingSnapshot } from "../state";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

function org(over: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return { plan: "PRO", status: "TRIALING", isInternal: false, trialEndsAt: days(10), graceEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...over };
}

describe("accessMode", () => {
  it("prueba vigente: todo funciona", () => expect(accessMode(org(), NOW)).toBe("full"));
  it("prueba vencida aunque el tick no haya corrido: solo lectura", () =>
    expect(accessMode(org({ trialEndsAt: days(-0.01) }), NOW)).toBe("read_only"));
  it("activa: todo funciona", () => expect(accessMode(org({ status: "ACTIVE" }), NOW)).toBe("full"));
  it("pago fallido dentro de la gracia: todo funciona", () =>
    expect(accessMode(org({ status: "PAST_DUE", graceEndsAt: days(2) }), NOW)).toBe("full"));
  it("gracia vencida: solo lectura", () => expect(accessMode(org({ status: "PAST_DUE", graceEndsAt: days(-1) }), NOW)).toBe("read_only"));
  it("cancelada y solo lectura: solo lectura", () => {
    expect(accessMode(org({ status: "CANCELED" }), NOW)).toBe("read_only");
    expect(accessMode(org({ status: "READ_ONLY" }), NOW)).toBe("read_only");
  });
  it("suspendida gana incluso a interna", () => expect(accessMode(org({ status: "SUSPENDED", isInternal: true }), NOW)).toBe("suspended"));
  it("interna sin prueba ni pago: todo funciona", () =>
    expect(accessMode(org({ status: "READ_ONLY", isInternal: true }), NOW)).toBe("full"));
});

describe("planLimits", () => {
  it("usa el catálogo del plan", () => {
    expect(planLimits({ plan: "BASIC", isInternal: false })).toMatchObject({ users: 2, channels: 1, apiAccess: false });
    expect(planLimits({ plan: "PRO", isInternal: false }).activeAutomations).toBe(Infinity);
  });
  it("interna: sin topes", () => expect(planLimits({ plan: "BASIC", isInternal: true }).contacts).toBe(Infinity));
});

describe("billingNotice", () => {
  it("prueba con muchos días: aviso informativo", () => expect(billingNotice(org(), NOW)).toMatchObject({ kind: "trial_ending", tone: "info", daysLeft: 10 }));
  it("prueba por vencer (≤3 días): advertencia", () =>
    expect(billingNotice(org({ trialEndsAt: days(2.5) }), NOW)).toMatchObject({ kind: "trial_ending", tone: "warning", daysLeft: 3 }));
  it("prueba vencida", () => expect(billingNotice(org({ trialEndsAt: days(-1) }), NOW)?.kind).toBe("trial_expired"));
  it("pago fallido muestra los días de gracia", () =>
    expect(billingNotice(org({ status: "PAST_DUE", graceEndsAt: days(4) }), NOW)).toMatchObject({ kind: "past_due", daysLeft: 4 }));
  it("activa sin nada pendiente: sin aviso", () => expect(billingNotice(org({ status: "ACTIVE" }), NOW)).toBeNull());
  it("activa con cancelación programada", () =>
    expect(billingNotice(org({ status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: days(9) }), NOW)).toMatchObject({ kind: "canceling", daysLeft: 9 }));
  it("interna: sin aviso", () => expect(billingNotice(org({ isInternal: true, trialEndsAt: days(-5) }), NOW)).toBeNull());
});

describe("tickTransition", () => {
  it("prueba vencida → solo lectura", () => expect(tickTransition(org({ trialEndsAt: days(-1) }), NOW)).toBe("READ_ONLY"));
  it("prueba vigente → sin cambio", () => expect(tickTransition(org(), NOW)).toBeNull());
  it("gracia vencida → solo lectura", () => expect(tickTransition(org({ status: "PAST_DUE", graceEndsAt: days(-1) }), NOW)).toBe("READ_ONLY"));
  it("activa e interna → sin cambio", () => {
    expect(tickTransition(org({ status: "ACTIVE" }), NOW)).toBeNull();
    expect(tickTransition(org({ isInternal: true, trialEndsAt: days(-1) }), NOW)).toBeNull();
  });
});

describe("deriveFromSubscription", () => {
  const prices = (id: string) => (id === "price_basic" ? "BASIC" : id === "price_pro" ? "PRO" : null);
  const base = { status: "TRIALING" as const, graceEndsAt: null, canceledAt: null };
  const sub = (status: string, over: Record<string, unknown> = {}) => ({ status, priceId: "price_basic", currentPeriodEnd: 1790000000, cancelAtPeriodEnd: false, ...over });

  it("activa: ACTIVE, plan del precio, periodo y gracia limpia", () => {
    const u = deriveFromSubscription(sub("active"), { ...base, graceEndsAt: days(3) }, NOW, prices);
    expect(u).toMatchObject({ status: "ACTIVE", plan: "BASIC", graceEndsAt: null, canceledAt: null });
    expect(u.currentPeriodEnd?.getTime()).toBe(1790000000 * 1000);
  });
  it("pago fallido: PAST_DUE con 7 días de gracia", () => {
    const u = deriveFromSubscription(sub("past_due"), { ...base, status: "ACTIVE" }, NOW, prices);
    expect(u.status).toBe("PAST_DUE");
    expect(u.graceEndsAt?.getTime()).toBe(days(7).getTime());
  });
  it("otro evento de pago fallido no reinicia la gracia", () => {
    const u = deriveFromSubscription(sub("past_due"), { ...base, status: "PAST_DUE", graceEndsAt: days(2) }, NOW, prices);
    expect(u.graceEndsAt?.getTime()).toBe(days(2).getTime());
  });
  it("sigue sin pagar tras la gracia: solo lectura", () =>
    expect(deriveFromSubscription(sub("unpaid"), { ...base, status: "PAST_DUE", graceEndsAt: days(-1) }, NOW, prices).status).toBe("READ_ONLY"));
  it("cancelada: CANCELED con fecha, conservando la primera", () => {
    expect(deriveFromSubscription(sub("canceled"), { ...base, status: "ACTIVE" }, NOW, prices)).toMatchObject({ status: "CANCELED", canceledAt: NOW });
    expect(deriveFromSubscription(sub("canceled"), { ...base, status: "CANCELED", canceledAt: days(-3) }, NOW, prices).canceledAt).toEqual(days(-3));
  });
  it("incompleta: no cambia el estado", () => expect(deriveFromSubscription(sub("incomplete"), base, NOW, prices).status).toBeUndefined());
  it("precio desconocido: no cambia el plan", () => expect(deriveFromSubscription(sub("active", { priceId: "price_x" }), base, NOW, prices).plan).toBeUndefined());
  it("suspendida por la plataforma: Stripe no la reactiva", () =>
    expect(deriveFromSubscription(sub("active"), { ...base, status: "SUSPENDED" }, NOW, prices).status).toBeUndefined());
  it("cancelación programada se refleja", () =>
    expect(deriveFromSubscription(sub("active", { cancelAtPeriodEnd: true }), base, NOW, prices).cancelAtPeriodEnd).toBe(true));
});
