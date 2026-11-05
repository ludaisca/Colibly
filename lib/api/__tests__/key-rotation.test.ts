import { describe, expect, it } from "vitest";
import { rotationExpiry } from "../key-rotation";

const NOW = new Date("2026-11-05T12:00:00Z");

describe("rotationExpiry", () => {
  it("sin gracia se revoca ya", () => expect(rotationExpiry(null, 0, NOW)).toBeNull());
  it("con gracia vence en 24 h", () => expect(rotationExpiry(null, 24, NOW)?.toISOString()).toBe("2026-11-06T12:00:00.000Z"));
  it("no alarga una key que ya vencía antes", () => {
    const soon = new Date("2026-11-05T18:00:00Z");
    expect(rotationExpiry(soon, 24, NOW)).toEqual(soon);
  });
  it("una que vence después queda en 24 h", () =>
    expect(rotationExpiry(new Date("2027-01-01T00:00:00Z"), 24, NOW)?.toISOString()).toBe("2026-11-06T12:00:00.000Z"));
});
