import { describe, expect, it } from "vitest";
import { accessMode, aiCreditLimit, billingNotice, deriveFromSubscription, extendTrial, planLimits, purgeDue, statusAfterSuspension, tickTransition, type BillingSnapshot } from "../state";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "../plans";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

function org(over: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return { plan: "PRO", status: "TRIALING", isInternal: false, trialEndsAt: days(10), graceEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, seatQuantity: 1, ...over };
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
    expect(planLimits({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 2 })).toMatchObject({
      seats: 2, whatsapp: 4, telegram: Infinity, messenger: Infinity, instagram: 4, apiAccess: true, webhooks: true,
    });
    expect(planLimits({ plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 1 }).activeAutomations).toBe(Infinity);
  });
  it("interna: sin topes", () => expect(planLimits({ plan: "BUSINESS", isInternal: true, status: "ACTIVE", seatQuantity: 1 }).contacts).toBe(Infinity));
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

describe("purgeDue", () => {
  const canceled = (daysAgo: number | null, over: Partial<{ isInternal: boolean; status: BillingSnapshot["status"] }> = {}) => ({
    status: "CANCELED" as BillingSnapshot["status"],
    isInternal: false,
    canceledAt: daysAgo === null ? null : days(-daysAgo),
    trialEndsAt: null,
    stripeSubscriptionId: null,
    ...over,
  });
  const expiredTrial = (daysAgo: number | null, stripeSubscriptionId: string | null = null) => ({
    status: "READ_ONLY" as const,
    isInternal: false,
    canceledAt: null,
    trialEndsAt: daysAgo === null ? null : days(-daysAgo),
    stripeSubscriptionId,
  });
  it("cancelada dentro de la retención: se conserva", () => expect(purgeDue(canceled(RETENTION_DAYS_AFTER_CANCEL - 1), NOW)).toBe(false));
  it("cancelada al cumplir la retención: se purga", () => expect(purgeDue(canceled(RETENTION_DAYS_AFTER_CANCEL), NOW)).toBe(true));
  it("sin fecha de cancelación: nunca", () => expect(purgeDue(canceled(null), NOW)).toBe(false));
  it("interna: nunca", () => expect(purgeDue(canceled(365, { isInternal: true }), NOW)).toBe(false));
  it("suspendida o activa, aunque tenga fecha vieja: no", () => {
    expect(purgeDue(canceled(365, { status: "SUSPENDED" }), NOW)).toBe(false);
    expect(purgeDue(canceled(365, { status: "ACTIVE" }), NOW)).toBe(false);
  });
  it("prueba vencida sin pagar, dentro de la retención: se conserva", () =>
    expect(purgeDue(expiredTrial(RETENTION_DAYS_AFTER_TRIAL - 1), NOW)).toBe(false));
  it("prueba vencida sin pagar, al cumplir la retención: se purga", () =>
    expect(purgeDue(expiredTrial(RETENTION_DAYS_AFTER_TRIAL), NOW)).toBe(true));
  it("solo lectura por impago (con suscripción): nunca por esta vía", () =>
    expect(purgeDue(expiredTrial(365, "sub_1"), NOW)).toBe(false));
  it("solo lectura sin fecha de fin de prueba: nunca", () => expect(purgeDue(expiredTrial(null), NOW)).toBe(false));
  it("en prueba con fecha vencida (el tick aún no la pasa a solo lectura): no", () =>
    expect(purgeDue({ ...expiredTrial(365), status: "TRIALING" }, NOW)).toBe(false));
});

describe("aiCreditLimit", () => {
  it("plan más bono", () => expect(aiCreditLimit({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 1, aiCreditsBonus: 200 })).toBe(1_450));
  it("un bono negativo no resta", () => expect(aiCreditLimit({ plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 1, aiCreditsBonus: -50 })).toBe(1_250));
  it("interna: sin límite", () => expect(aiCreditLimit({ plan: "BUSINESS", isInternal: true, status: "ACTIVE", seatQuantity: 1, aiCreditsBonus: 0 })).toBe(Infinity));
});

describe("extendTrial", () => {
  const base = { status: "TRIALING" as const, isInternal: false, trialEndsAt: days(3), stripeSubscriptionId: null };
  const ok = (r: ReturnType<typeof extendTrial>) => {
    if ("error" in r) throw new Error(r.error);
    return r;
  };
  it("prueba vigente: suma a la fecha actual de fin", () => expect(ok(extendTrial(base, 7, NOW)).trialEndsAt).toEqual(days(10)));
  it("prueba vencida (solo lectura): cuenta desde hoy y vuelve a prueba", () => {
    const r = ok(extendTrial({ ...base, status: "READ_ONLY", trialEndsAt: days(-5) }, 7, NOW));
    expect(r.status).toBe("TRIALING");
    expect(r.trialEndsAt).toEqual(days(7));
  });
  it("cancelada: vuelve a prueba y sale de la purga", () => {
    const r = ok(extendTrial({ ...base, status: "CANCELED", trialEndsAt: null, stripeSubscriptionId: "sub_1" }, 14, NOW));
    expect(r.status).toBe("TRIALING");
    expect(r.canceledAt).toBeNull();
  });
  it("con suscripción vigente o impago: no", () => {
    expect("error" in extendTrial({ ...base, status: "ACTIVE" }, 7, NOW)).toBe(true);
    expect("error" in extendTrial({ ...base, status: "PAST_DUE" }, 7, NOW)).toBe(true);
    expect("error" in extendTrial({ ...base, status: "READ_ONLY", stripeSubscriptionId: "sub_1" }, 7, NOW)).toBe(true);
  });
  it("suspendida, interna o días fuera de rango: no", () => {
    expect("error" in extendTrial({ ...base, status: "SUSPENDED" }, 7, NOW)).toBe(true);
    expect("error" in extendTrial({ ...base, isInternal: true }, 7, NOW)).toBe(true);
    expect("error" in extendTrial(base, 0, NOW)).toBe(true);
    expect("error" in extendTrial(base, 91, NOW)).toBe(true);
    expect("error" in extendTrial(base, 1.5, NOW)).toBe(true);
  });
});

describe("statusAfterSuspension", () => {
  it("con prueba vigente: en prueba", () => expect(statusAfterSuspension({ trialEndsAt: days(2), canceledAt: null }, NOW)).toBe("TRIALING"));
  it("prueba vencida: solo lectura", () => expect(statusAfterSuspension({ trialEndsAt: days(-2), canceledAt: null }, NOW)).toBe("READ_ONLY"));
  it("cancelada antes de suspenderse: sigue cancelada (y corre su purga)", () =>
    expect(statusAfterSuspension({ trialEndsAt: days(2), canceledAt: days(-10) }, NOW)).toBe("CANCELED"));
});

describe("deriveFromSubscription", () => {
  const prices = (id: string) => (id === "price_basic" ? "BUSINESS" : id === "price_pro" ? "PRO" : null);
  const base = { status: "TRIALING" as const, graceEndsAt: null, canceledAt: null };
  const sub = (status: string, over: Record<string, unknown> = {}) => ({ status, priceId: "price_basic", quantity: 1, currentPeriodEnd: 1790000000, cancelAtPeriodEnd: false, ...over });

  it("activa: ACTIVE, plan del precio, periodo y gracia limpia", () => {
    const u = deriveFromSubscription(sub("active"), { ...base, graceEndsAt: days(3) }, NOW, prices);
    expect(u).toMatchObject({ status: "ACTIVE", plan: "BUSINESS", graceEndsAt: null, canceledAt: null });
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

describe("prueba de 14 días", () => {
  it("dura 14 días, avisa a 7, 3 y 1 días y la gracia solo es para impagos", async () => {
    const { TRIAL_DAYS, GRACE_DAYS } = await import("../plans");
    const { TRIAL_REMINDER_DAYS, PAST_DUE_REMINDER_DAYS } = await import("../state");
    expect(TRIAL_DAYS).toBe(14);
    expect(GRACE_DAYS).toBe(7);
    expect([...TRIAL_REMINDER_DAYS]).toEqual([7, 3, 1]);
    // Los recordatorios de pago caen dentro de la gracia.
    expect(PAST_DUE_REMINDER_DAYS.every((d) => d > 0 && d < GRACE_DAYS)).toBe(true);
  });
  it("al vencer pasa a solo lectura sin gracia aunque haya graceEndsAt", () =>
    expect(accessMode(org({ trialEndsAt: days(-1), graceEndsAt: days(5) }), NOW)).toBe("read_only"));
});
