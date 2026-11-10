import { beforeEach, describe, expect, it, vi } from "vitest";

const isChannellessTrial = vi.fn();
const reserveTrialTestCredit = vi.fn();
const refundTrialTestCredit = vi.fn();
vi.mock("@/lib/billing/trial-test", () => ({ isChannellessTrial, reserveTrialTestCredit, refundTrialTestCredit }));
const userUpdateMany = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { updateMany: userUpdateMany, findUnique: userFindUnique }, organization: { updateMany: vi.fn(), findUnique: vi.fn() } } }));
vi.mock("@/lib/billing/gates", () => ({ getOrgBilling: vi.fn(), invalidateOrgBilling: vi.fn() }));
vi.mock("@/lib/billing/notify", () => ({ notifyOrgAdmins: vi.fn() }));
const userEntitlement = vi.fn();
vi.mock("@/lib/billing/entitlements", () => ({ userEntitlement, channelEntitlement: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ appUrl: vi.fn(), sendEmailSafely: vi.fn() }));
vi.mock("@/lib/email/templates", () => ({ billingNoticeTemplate: vi.fn() }));

const { reservePersonAiCredit } = await import("../credits");

beforeEach(() => {
  [isChannellessTrial, reserveTrialTestCredit, refundTrialTestCredit, userUpdateMany, userFindUnique, userEntitlement].forEach((m) => m.mockReset());
});

describe("reservePersonAiCredit", () => {
  it("sin canal y en prueba usa la bolsa de la organización y no toca los créditos del usuario", async () => {
    isChannellessTrial.mockResolvedValue(true);
    reserveTrialTestCredit.mockResolvedValue(true);
    const r = await reservePersonAiCredit("u1", "o1");
    expect(r.ok && r.mode).toBe("channelless_trial");
    expect(reserveTrialTestCredit).toHaveBeenCalledWith("o1");
    expect(userUpdateMany).not.toHaveBeenCalled();
    if (r.ok) await r.refund();
    expect(refundTrialTestCredit).toHaveBeenCalledWith("o1");
  });
  it("la bolsa agotada responde trial_test_exhausted", async () => {
    isChannellessTrial.mockResolvedValue(true);
    reserveTrialTestCredit.mockResolvedValue(false);
    expect(await reservePersonAiCredit("u1", "o1")).toEqual({ ok: false, reason: "trial_test_exhausted" });
  });
  it("con canal o plan pagado sigue la ruta normal (créditos del usuario)", async () => {
    isChannellessTrial.mockResolvedValue(false);
    userEntitlement.mockResolvedValue({ mode: "internal", organizationId: "o1" });
    const r = await reservePersonAiCredit("u1", "o1");
    expect(r).toMatchObject({ ok: true, mode: "normal" });
    expect(reserveTrialTestCredit).not.toHaveBeenCalled();
  });
});
