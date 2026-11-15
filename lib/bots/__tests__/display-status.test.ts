import { describe, expect, it } from "vitest";
import { botDisplayStatus } from "../display-status";

const base = { isActive: true, status: "ACTIVE", waAccountId: "wa1", channelAccountId: null };

describe("botDisplayStatus", () => {
  it("activo solo con cuenta, encendido y sin error", () => {
    expect(botDisplayStatus(base)).toBe("active");
    expect(botDisplayStatus({ ...base, waAccountId: null, channelAccountId: "ch1" })).toBe("active");
  });
  it("sin cuenta conectada nunca aparece activo", () => {
    expect(botDisplayStatus({ ...base, waAccountId: null })).toBe("no_account");
  });
  it("apagado aunque status siga en ACTIVE", () => {
    expect(botDisplayStatus({ ...base, isActive: false })).toBe("inactive");
  });
  it("el error gana a encendido", () => {
    expect(botDisplayStatus({ ...base, status: "ERROR" })).toBe("error");
  });
});
