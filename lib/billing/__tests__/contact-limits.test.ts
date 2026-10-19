import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  org: { isInternal: false, currentPeriodEnd: null as Date | null, contactAlertLevel: 0, contactAlertPeriod: null as string | null },
  contacts: 0,
  overLimit: 0,
  max: 100 as number,
  notify: vi.fn(async () => {}),
  contactUpdate: vi.fn(async () => ({})),
  orgUpdateMany: vi.fn(async () => ({ count: 1 })),
  contactFindUnique: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn(async () => db.org), updateMany: (...a: unknown[]) => db.orgUpdateMany(...(a as [])) },
    contact: { count: vi.fn(async () => db.overLimit), update: (...a: unknown[]) => db.contactUpdate(...(a as [])), updateMany: vi.fn(async () => ({ count: 0 })), findUnique: (...a: unknown[]) => db.contactFindUnique(...(a as [])) },
    $executeRaw: vi.fn(async () => 0),
  },
}));
vi.mock("@/lib/billing/gates", () => ({
  getOrgBilling: vi.fn(async () => ({ plan: "PRO", isInternal: db.org.isInternal, status: "ACTIVE", seatQuantity: 1 })),
  getOrgUsage: vi.fn(async () => ({ contacts: db.contacts })),
  orgIdForAccount: vi.fn(async () => "org1"),
}));
vi.mock("@/lib/billing/state", () => ({ planLimits: vi.fn(() => ({ contacts: db.max })) }));
vi.mock("@/lib/billing/notify", () => ({ notifyOrgAdmins: (...a: unknown[]) => db.notify(...(a as [])) }));

import { afterContactCreated, checkContactAlerts, contactLimitLevel, graceCap, isContactOverLimit, nextAlertState } from "@/lib/billing/contact-limits";

describe("niveles", () => {
  it("80 / 100 / 120 %", () => {
    expect(contactLimitLevel(79, 100)).toBe("ok");
    expect(contactLimitLevel(80, 100)).toBe("warning");
    expect(contactLimitLevel(100, 100)).toBe("full");
    expect(contactLimitLevel(120, 100)).toBe("full");
    expect(contactLimitLevel(121, 100)).toBe("grace");
    expect(contactLimitLevel(10_000, null)).toBe("ok");
    expect(graceCap(5000)).toBe(6000);
  });
});

describe("nextAlertState", () => {
  it("avisa una vez por umbral y periodo", () => {
    expect(nextAlertState({ level: 0, period: null }, 80, "m:2026-10")).toEqual({ level: 80, period: "m:2026-10", notify: true });
    expect(nextAlertState({ level: 80, period: "m:2026-10" }, 80, "m:2026-10").notify).toBe(false);
    expect(nextAlertState({ level: 80, period: "m:2026-10" }, 100, "m:2026-10").notify).toBe(true);
  });
  it("se reinicia al cambiar de periodo y al bajar el uso", () => {
    expect(nextAlertState({ level: 100, period: "m:2026-09" }, 100, "m:2026-10").notify).toBe(true);
    const dropped = nextAlertState({ level: 100, period: "m:2026-10" }, 0, "m:2026-10");
    expect(dropped).toEqual({ level: 0, period: "m:2026-10", notify: false });
    expect(nextAlertState(dropped, 80, "m:2026-10").notify).toBe(true);
  });
});

describe("afterContactCreated / avisos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.org = { isInternal: false, currentPeriodEnd: null, contactAlertLevel: 0, contactAlertPeriod: null };
    db.max = 100;
  });

  it("debajo del 120 % no marca; avisa al 80 %", async () => {
    db.contacts = 85;
    expect(await afterContactCreated({ waAccountId: "a" }, "c1")).toBe(false);
    expect(db.contactUpdate).not.toHaveBeenCalled();
    expect(db.notify).toHaveBeenCalledTimes(1);
    expect((db.notify.mock.calls[0] as unknown[])[1]).toMatchObject({ title: expect.stringMatching(/80 %/) });
  });
  it("arriba del 120 % marca el contacto nuevo overLimit", async () => {
    db.contacts = 121;
    expect(await afterContactCreated({ waAccountId: "a" }, "c1")).toBe(true);
    expect(db.contactUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { overLimit: true } });
  });
  it("no repite el aviso del mismo umbral", async () => {
    db.contacts = 100;
    db.org = { ...db.org, contactAlertLevel: 100, contactAlertPeriod: `m:${new Date().toISOString().slice(0, 7)}` };
    await checkContactAlerts("org1");
    expect(db.notify).not.toHaveBeenCalled();
    expect(db.orgUpdateMany).not.toHaveBeenCalled();
  });
  it("organización interna: sin avisos ni marcas", async () => {
    db.org = { ...db.org, isInternal: true };
    db.max = Infinity;
    db.contacts = 99_999;
    expect(await afterContactCreated({ waAccountId: "a" }, "c1")).toBe(false);
    expect(db.notify).not.toHaveBeenCalled();
  });
  it("isContactOverLimit", async () => {
    db.contactFindUnique.mockResolvedValue({ overLimit: true });
    expect(await isContactOverLimit("c1")).toBe(true);
    expect(await isContactOverLimit(null)).toBe(false);
  });
});
