import { describe, it, expect } from "vitest";
import { backupFreshness } from "../freshness";

const now = new Date("2026-10-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);

describe("backupFreshness", () => {
  it("desactivado → disabled, aunque haya respaldos viejos", () => {
    expect(backupFreshness({ enabled: false, lastSuccessAt: hoursAgo(1), now })).toBe("disabled");
  });
  it("activado sin ningún respaldo correcto → never", () => {
    expect(backupFreshness({ enabled: true, lastSuccessAt: null, now })).toBe("never");
  });
  it("reciente → ok (incluida la frontera de 36 h)", () => {
    expect(backupFreshness({ enabled: true, lastSuccessAt: hoursAgo(2), now })).toBe("ok");
    expect(backupFreshness({ enabled: true, lastSuccessAt: hoursAgo(36), now })).toBe("ok");
  });
  it("más de 36 h → stale", () => {
    expect(backupFreshness({ enabled: true, lastSuccessAt: hoursAgo(36.1), now })).toBe("stale");
    expect(backupFreshness({ enabled: true, lastSuccessAt: hoursAgo(100), now })).toBe("stale");
  });
  it("el máximo es configurable", () => {
    expect(backupFreshness({ enabled: true, lastSuccessAt: hoursAgo(5), now, maxAgeHours: 4 })).toBe("stale");
  });
});
