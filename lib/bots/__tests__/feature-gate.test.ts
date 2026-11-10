import { beforeEach, describe, expect, it, vi } from "vitest";

const checkUserFeature = vi.fn();
const checkChannelFeature = vi.fn();
vi.mock("@/lib/billing/entitlements", () => ({ checkUserFeature, checkChannelFeature }));

const { checkBotFeature, isTestOnlyBot } = await import("../feature-gate");

beforeEach(() => {
  checkUserFeature.mockReset().mockResolvedValue(null);
  checkChannelFeature.mockReset().mockResolvedValue(null);
});

describe("checkBotFeature", () => {
  it("sin cuenta ni canal valida la licencia de quien lo crea", async () => {
    await checkBotFeature("u1", { waAccountId: null, channelAccountId: undefined });
    expect(checkUserFeature).toHaveBeenCalledWith("u1", "aiAgent");
    expect(checkChannelFeature).not.toHaveBeenCalled();
  });
  it("con cuenta de WhatsApp valida la licencia del dueño del canal", async () => {
    await checkBotFeature("u1", { waAccountId: "wa1" });
    expect(checkChannelFeature).toHaveBeenCalledWith({ waAccountId: "wa1", channelAccountId: null }, "aiAgent");
    expect(checkUserFeature).not.toHaveBeenCalled();
  });
  it("con canal genérico también usa el canal", async () => {
    await checkBotFeature("u1", { channelAccountId: "ch1" });
    expect(checkChannelFeature).toHaveBeenCalledWith({ waAccountId: null, channelAccountId: "ch1" }, "aiAgent");
  });
});

describe("isTestOnlyBot", () => {
  it("es solo de pruebas cuando no tiene ningún canal", () => {
    expect(isTestOnlyBot({ waAccountId: null, channelAccountId: null })).toBe(true);
    expect(isTestOnlyBot({ waAccountId: "wa1" })).toBe(false);
  });
});
