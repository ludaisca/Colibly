import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn() },
  authToken: { count: vi.fn() },
  wAAccount: { count: vi.fn() },
  channelAccount: { count: vi.fn() },
  contact: { count: vi.fn() },
  automation: { count: vi.fn() },
  pipeline: { count: vi.fn() },
  contactCustomFieldDefinition: { count: vi.fn() },
  wABot: { count: vi.fn() },
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
    expect(r.message).toMatch(/ya los tienes/);
    expect(r.message).toMatch(/hasta 3 usuarios/);
  });
  it("sin asientos libres manda a Plan y facturación", () => {
    expect(perSeatLimitMessage("telegram", 3, { trialing: true, activeUsers: 3, seatCap: 3 }).actionUrl).toBe("/configuracion/plan#asientos");
  });
});

// Catálogo anterior (por asiento): rige a las organizaciones con legacyUntil.
describe("evaluatePlanLimit (dry run, sin conectar nada)", () => {
  let n = 0;
  const orgId = () => `org-${n}`;
  beforeEach(() => {
    n++;
    invalidateOrgBilling(orgId());
    vi.clearAllMocks();
    db.organization.findUnique.mockResolvedValue({ id: orgId(), name: "Vamex", plan: "ESSENTIAL", status: "TRIALING", isInternal: false, seatQuantity: 1, trialEndsAt: new Date(Date.now() + 864e5), graceEndsAt: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: null, stripeCustomerId: null, stripeSubscriptionId: null, canceledAt: null, legacyUntil: new Date(Date.now() + 30 * 864e5) });
    db.user.count.mockResolvedValue(1);
    db.authToken.count.mockResolvedValue(1); // invitación pendiente: no cuenta
    db.wAAccount.count.mockResolvedValue(1);
    db.channelAccount.count.mockResolvedValue(0);
    db.contact.count.mockResolvedValue(71);
    db.automation.count.mockResolvedValue(0);
    db.pipeline.count.mockResolvedValue(1);
    db.contactCustomFieldDefinition.count.mockResolvedValue(0);
    db.wABot.count.mockResolvedValue(0);
  });

  it("prueba de Básico con 1 usuario y 1 número: bloquea el segundo", async () => {
    const r = await evaluatePlanLimit(orgId(), "whatsapp");
    expect(r).toMatchObject({ limit: "whatsapp", current: 1, max: 1, actionUrl: "/usuarios" });
  });
  it("con 2 usuarios permite el segundo número", async () => {
    db.user.count.mockResolvedValue(2);
    expect(await evaluatePlanLimit(orgId(), "whatsapp")).toBeNull();
  });
  it("mismo criterio para Instagram en Básico", async () => {
    db.channelAccount.count.mockResolvedValue(1);
    expect(await evaluatePlanLimit(orgId(), "instagram")).toMatchObject({ max: 1 });
  });
  it("Telegram no tiene tope en Básico", async () => {
    db.channelAccount.count.mockResolvedValue(8);
    expect(await evaluatePlanLimit(orgId(), "telegram")).toBeNull();
  });
  it("los asientos de la prueba siguen siendo 3", async () => {
    expect(await evaluatePlanLimit(orgId(), "seats")).toBeNull();
  });
});

// Catálogo de licencias: cupos de la organización según las licencias de sus
// personas activas (docs/PLAN_LICENCIAS_2026-11-04.md, decisión 2).
describe("evaluatePlanLimit con licencias", () => {
  let n = 0;
  const orgId = () => `lic-${n}`;
  beforeEach(() => {
    n++;
    invalidateOrgBilling(orgId());
    vi.clearAllMocks();
    db.organization.findUnique.mockResolvedValue({ id: orgId(), name: "Spa Aurora", plan: "PRO", status: "ACTIVE", isInternal: false, seatQuantity: 3, trialEndsAt: null, graceEndsAt: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsPeriodStart: null, stripeCustomerId: "cus", stripeSubscriptionId: "sub", canceledAt: null, legacyUntil: null });
    db.user.findMany.mockResolvedValue([{ license: "ESSENTIAL" }, { license: "ESSENTIAL" }, { license: "BUSINESS" }]);
    db.user.count.mockResolvedValue(3);
    db.authToken.count.mockResolvedValue(0);
    db.wAAccount.count.mockResolvedValue(3);
    db.channelAccount.count.mockResolvedValue(1);
    db.contact.count.mockResolvedValue(8_999);
    db.automation.count.mockResolvedValue(40);
    db.pipeline.count.mockResolvedValue(5);
    db.contactCustomFieldDefinition.count.mockResolvedValue(10);
    db.wABot.count.mockResolvedValue(9);
  });

  it("un canal de cada tipo por licencia: con 3 licencias y 3 números, el cuarto no", async () => {
    const r = await evaluatePlanLimit(orgId(), "whatsapp");
    expect(r).toMatchObject({ limit: "whatsapp", current: 3, max: 3, actionUrl: "/usuarios" });
    expect(r?.message).toContain("Cada licencia incluye un número de WhatsApp");
    expect(await evaluatePlanLimit(orgId(), "telegram")).toBeNull();
    expect(await evaluatePlanLimit(orgId(), "webchat")).toBeNull();
  });

  it("contactos y leads se suman por licencia (2 × 2,000 + 5,000)", async () => {
    expect(await evaluatePlanLimit(orgId(), "contacts")).toBeNull();
    expect(await evaluatePlanLimit(orgId(), "contacts", 2)).toMatchObject({ max: 9_000 });
  });

  it("embudos y campos son los de la licencia más alta (Avanzado: 5 / 50)", async () => {
    expect(await evaluatePlanLimit(orgId(), "funnels")).toMatchObject({ max: 5 });
    expect(await evaluatePlanLimit(orgId(), "customFields")).toBeNull();
  });

  it("automatizaciones y agentes no tienen tope de cantidad (los decide la licencia)", async () => {
    expect(await evaluatePlanLimit(orgId(), "activeAutomations")).toBeNull();
    expect(await evaluatePlanLimit(orgId(), "aiAgents")).toBeNull();
  });
});
