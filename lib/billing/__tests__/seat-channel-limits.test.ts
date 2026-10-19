import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { count: vi.fn() },
  authToken: { count: vi.fn() },
  wAAccount: { count: vi.fn() },
  channelAccount: { count: vi.fn() },
  contact: { count: vi.fn() },
  automation: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { channelSeatBase, type SeatSnapshot } from "@/lib/billing/state";
import { evaluatePlanLimit, invalidateOrgBilling, perSeatLimitMessage } from "@/lib/billing/gates";

const trial: SeatSnapshot = { plan: "PRO", isInternal: false, status: "TRIALING", seatQuantity: 1 };

describe("channelSeatBase (1 conexión por ejecutivo)", () => {
  it("prueba: ejecutivos activos, no TRIAL_MAX_SEATS", () => {
    expect(channelSeatBase(trial, 1)).toBe(1);
    expect(channelSeatBase(trial, 2)).toBe(2);
    expect(channelSeatBase(trial, 9)).toBe(3);
  });
  it("de pago: tope en los asientos cobrados", () => {
    const paid: SeatSnapshot = { plan: "PRO", isInternal: false, status: "ACTIVE", seatQuantity: 4 };
    expect(channelSeatBase(paid, 2)).toBe(2);
    expect(channelSeatBase(paid, 6)).toBe(4);
  });
  it("mínimo 1 e interna sin tope", () => {
    expect(channelSeatBase(trial, 0)).toBe(1);
    expect(channelSeatBase({ ...trial, isInternal: true }, 1)).toBe(Infinity);
  });
});

describe("perSeatLimitMessage", () => {
  it("con asiento libre manda a invitar", () => {
    const r = perSeatLimitMessage("whatsapp", 1, { trialing: true, activeUsers: 1, seatCap: 3 });
    expect(r.actionUrl).toBe("/usuarios");
    expect(r.message).toMatch(/Coexistencia o por API/);
    expect(r.message).toMatch(/hasta 3 ejecutivos/);
  });
  it("sin asientos libres manda a Plan y facturación", () => {
    expect(perSeatLimitMessage("telegram", 3, { trialing: true, activeUsers: 3, seatCap: 3 }).actionUrl).toBe("/configuracion/plan#asientos");
  });
});

describe("evaluatePlanLimit (dry run, sin conectar nada)", () => {
  let n = 0;
  const orgId = () => `org-${n}`;
  beforeEach(() => {
    n++;
    invalidateOrgBilling(orgId());
    vi.clearAllMocks();
    db.organization.findUnique.mockResolvedValue({ id: orgId(), name: "Vamex", plan: "PRO", status: "TRIALING", isInternal: false, seatQuantity: 1, trialEndsAt: new Date(Date.now() + 864e5), graceEndsAt: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: null, stripeCustomerId: null, stripeSubscriptionId: null, canceledAt: null });
    db.user.count.mockResolvedValue(1);
    db.authToken.count.mockResolvedValue(1); // invitación pendiente: no cuenta
    db.wAAccount.count.mockResolvedValue(1);
    db.channelAccount.count.mockResolvedValue(0);
    db.contact.count.mockResolvedValue(71);
    db.automation.count.mockResolvedValue(0);
  });

  it("prueba con 1 ejecutivo y 1 número: bloquea el segundo (Coexistencia o API)", async () => {
    const r = await evaluatePlanLimit(orgId(), "whatsapp");
    expect(r).toMatchObject({ limit: "whatsapp", current: 1, max: 1, actionUrl: "/usuarios" });
  });
  it("con 2 ejecutivos permite el segundo número", async () => {
    db.user.count.mockResolvedValue(2);
    expect(await evaluatePlanLimit(orgId(), "whatsapp")).toBeNull();
  });
  it("mismo criterio para Telegram en prueba", async () => {
    db.channelAccount.count.mockResolvedValue(1);
    expect(await evaluatePlanLimit(orgId(), "telegram")).toMatchObject({ max: 1 });
  });
  it("los asientos de la prueba siguen siendo 3", async () => {
    expect(await evaluatePlanLimit(orgId(), "seats")).toBeNull();
  });
});
