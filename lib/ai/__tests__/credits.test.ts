import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanId } from "@prisma/client";

// Quién paga cada crédito de IA (regla 6 de las licencias) y el tope
// personal con reserva atómica; en legacy, la bolsa de la organización.

type Row = { aiCreditsUsed: number; aiCreditsBonus: number; aiCreditsAlertLevel: number; disabledAt: Date | null; email: string; aiCreditsPeriodStart: Date };
const db = vi.hoisted(() => ({
  users: new Map<string, Row>(),
  org: { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsAlertLevel: 0, plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 2 },
  entitlement: null as null | { mode: string; license: PlanId; holder: { id: string; disabled: boolean } | null },
  notifications: [] as unknown[],
  orgAdmins: vi.fn(async () => {}),
  mail: vi.fn(async () => {}),
}));

function matchesUser(row: Row, where: Record<string, unknown>) {
  const lt = (where.aiCreditsUsed as { lt?: number } | undefined)?.lt;
  if (lt !== undefined && !(row.aiCreditsUsed < lt)) return false;
  const level = (where.aiCreditsAlertLevel as { lt?: number } | undefined)?.lt;
  if (level !== undefined && !(row.aiCreditsAlertLevel < level)) return false;
  const lte = (where.aiCreditsPeriodStart as { lte?: Date } | undefined)?.lte;
  if (lte !== undefined && !(row.aiCreditsPeriodStart <= lte)) return false;
  if ("disabledAt" in where && where.disabledAt === null && row.disabledAt) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown> & { id: string }; data: Record<string, unknown> }) => {
        const row = db.users.get(where.id);
        if (!row || !matchesUser(row, where)) return { count: 0 };
        const inc = (data.aiCreditsUsed as { increment?: number } | undefined)?.increment;
        if (inc) row.aiCreditsUsed += inc;
        else Object.assign(row, data);
        return { count: 1 };
      }),
    },
    organization: {
      findUnique: vi.fn(async () => db.org),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const lt = (where.aiCreditsUsed as { lt?: number } | undefined)?.lt;
        if (lt !== undefined && !(db.org.aiCreditsUsed < lt)) return { count: 0 };
        if (where.aiCreditsPeriodStart) return { count: 0 };
        const inc = (data.aiCreditsUsed as { increment?: number } | undefined)?.increment;
        if (inc) db.org.aiCreditsUsed += inc;
        return { count: 1 };
      }),
    },
    notification: { create: vi.fn(async (a: unknown) => db.notifications.push(a)) },
  },
}));
vi.mock("@/lib/billing/gates", () => ({ getOrgBilling: vi.fn(), invalidateOrgBilling: vi.fn() }));
vi.mock("@/lib/billing/notify", () => ({ notifyOrgAdmins: db.orgAdmins }));
vi.mock("@/lib/email/mailer", () => ({ appUrl: (p: string) => `https://app.test${p}`, sendEmailSafely: db.mail }));
vi.mock("@/lib/email/templates", () => ({ billingNoticeTemplate: vi.fn(() => ({})) }));
vi.mock("@/lib/billing/entitlements", () => {
  const resolve = async () =>
    db.entitlement && { organizationId: "org1", org: { status: "ACTIVE" }, mode: db.entitlement.mode, license: db.entitlement.license, holder: db.entitlement.holder };
  return { userEntitlement: vi.fn(resolve), channelEntitlement: vi.fn(resolve) };
});

import { hasAiCredits, reserveAiCredit } from "../credits";

const recent = () => new Date(Date.now() - 864e5);

function setUser(id: string, used: number, extra: Partial<Row> = {}) {
  db.users.set(id, { aiCreditsUsed: used, aiCreditsBonus: 0, aiCreditsAlertLevel: 0, disabledAt: null, email: `${id}@test`, aiCreditsPeriodStart: recent(), ...extra });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.users.clear();
  db.notifications = [];
  db.org = { aiCreditsUsed: 0, aiCreditsBonus: 0, aiCreditsAlertLevel: 0, plan: "BUSINESS", isInternal: false, status: "ACTIVE", seatQuantity: 2 };
});

describe("con licencias: cada persona gasta los suyos", () => {
  it("Avanzado: 1,000 al mes; el crédito 1,001 no pasa", async () => {
    db.entitlement = { mode: "license", license: "BUSINESS", holder: { id: "ana", disabled: false } };
    setUser("ana", 998);
    expect(await reserveAiCredit({ userId: "ana" })).toBe(true);
    expect(await reserveAiCredit({ userId: "ana" })).toBe(true);
    expect(await reserveAiCredit({ userId: "ana" })).toBe(false);
    expect(db.users.get("ana")!.aiCreditsUsed).toBe(1_000);
    // Nunca toca la bolsa de la organización.
    expect(db.org.aiCreditsUsed).toBe(0);
  });

  it("Básico: 0 créditos, aunque tenga bono", async () => {
    db.entitlement = { mode: "license", license: "ESSENTIAL", holder: { id: "beto", disabled: false } };
    setUser("beto", 0, { aiCreditsBonus: 300 });
    expect(await reserveAiCredit({ userId: "beto" })).toBe(false);
    expect(await hasAiCredits({ userId: "beto" })).toBe(false);
  });

  it("lo automático sobre un chat cobra al dueño del canal; sin dueño, nadie paga", async () => {
    db.entitlement = { mode: "license", license: "PRO", holder: { id: "dueno", disabled: false } };
    setUser("dueno", 10);
    expect(await reserveAiCredit({ channel: { waAccountId: "wa1" } })).toBe(true);
    expect(db.users.get("dueno")!.aiCreditsUsed).toBe(11);
    db.entitlement = { mode: "license", license: "ESSENTIAL", holder: null };
    expect(await reserveAiCredit({ channel: { waAccountId: "wa2" } })).toBe(false);
  });

  it("avisa a la persona al 80 % (campana) y al 100 % (campana y correo), una vez", async () => {
    db.entitlement = { mode: "license", license: "BUSINESS", holder: { id: "ana", disabled: false } };
    setUser("ana", 799);
    await reserveAiCredit({ userId: "ana" });
    await reserveAiCredit({ userId: "ana" });
    expect(db.notifications).toHaveLength(1);
    expect(db.mail).not.toHaveBeenCalled();
    db.users.get("ana")!.aiCreditsUsed = 999;
    await reserveAiCredit({ userId: "ana" });
    expect(db.notifications).toHaveLength(2);
    expect(db.mail).toHaveBeenCalledTimes(1);
    expect(db.orgAdmins).not.toHaveBeenCalled();
  });
});

describe("catálogo anterior e internas", () => {
  it("legacy: la bolsa de la organización", async () => {
    db.entitlement = { mode: "legacy", license: "BUSINESS", holder: { id: "ana", disabled: false } };
    setUser("ana", 0);
    expect(await reserveAiCredit({ userId: "ana" })).toBe(true);
    expect(db.org.aiCreditsUsed).toBe(1);
    expect(db.users.get("ana")!.aiCreditsUsed).toBe(0);
  });

  it("interna: sin tope ni conteo", async () => {
    db.entitlement = { mode: "internal", license: "PRO", holder: null };
    expect(await reserveAiCredit({ channel: { waAccountId: "wa1" } })).toBe(true);
    expect(db.org.aiCreditsUsed).toBe(0);
  });
});
