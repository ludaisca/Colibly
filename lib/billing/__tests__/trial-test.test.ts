import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { updateMany, findUnique } } }));
vi.mock("@/lib/billing/gates", () => ({ invalidateOrgBilling: vi.fn() }));

const t = await import("../trial-test");
const { TRIAL_AI_TEST_CREDITS } = await import("../plans");

beforeEach(() => {
  updateMany.mockReset();
  findUnique.mockReset();
});

describe("modo de prueba sin canal", () => {
  const base = { status: "TRIALING", isInternal: false, waAccounts: 0, channelAccounts: 0 };
  it("solo en prueba, no interna y sin ningún canal", () => {
    expect(t.isChannellessTrialState(base)).toBe(true);
    expect(t.isChannellessTrialState({ ...base, status: "ACTIVE" })).toBe(false);
    expect(t.isChannellessTrialState({ ...base, isInternal: true })).toBe(false);
    expect(t.isChannellessTrialState({ ...base, waAccounts: 1 })).toBe(false);
    expect(t.isChannellessTrialState({ ...base, channelAccounts: 1 })).toBe(false);
  });
  it("el tope es de 10 mensajes", () => {
    expect(TRIAL_AI_TEST_CREDITS).toBe(10);
  });
});

describe("reserveTrialTestCredit", () => {
  it("reserva con un incremento atómico condicionado al tope", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    expect(await t.reserveTrialTestCredit("o1")).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "o1", trialTestAiUsed: { lt: TRIAL_AI_TEST_CREDITS } },
      data: { trialTestAiUsed: { increment: 1 } },
    });
  });
  it("agotado: count 0 → false", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await t.reserveTrialTestCredit("o1")).toBe(false);
  });
  it("con 15 llamadas simultáneas y la condición del where, solo pasan 10", async () => {
    // Simula Postgres: el updateMany evalúa el where y aplica el incremento de forma atómica.
    let used = 0;
    updateMany.mockImplementation(async (args: { where: { trialTestAiUsed?: { lt: number } } }) => {
      if (args.where.trialTestAiUsed && used >= args.where.trialTestAiUsed.lt) return { count: 0 };
      used += 1;
      return { count: 1 };
    });
    const results = await Promise.all(Array.from({ length: 15 }, () => t.reserveTrialTestCredit("o1")));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});

describe("refundTrialTestCredit", () => {
  it("devuelve el crédito sin bajar de cero", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await t.refundTrialTestCredit("o1");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "o1", trialTestAiUsed: { gt: 0 } }, data: { trialTestAiUsed: { decrement: 1 } } });
  });
});

describe("trialTestStatusOf", () => {
  it("calcula lo que queda sin pasar de cero", () => {
    expect(t.trialTestStatusOf(3, "channelless_trial")).toEqual({ used: 3, max: 10, remaining: 7, mode: "channelless_trial" });
    expect(t.trialTestStatusOf(12, "normal").remaining).toBe(0);
  });
});
