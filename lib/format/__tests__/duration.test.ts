import { describe, expect, it } from "vitest";
import { formatDuration } from "../duration";

describe("formatDuration", () => {
  it("minutos, horas y días legibles", () => {
    expect(formatDuration(0.4)).toBe("< 1 min");
    expect(formatDuration(3.2)).toBe("3 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(135)).toBe("2 h 15 min");
    expect(formatDuration(5556)).toBe("3.9 días");
    expect(formatDuration(1440)).toBe("1 día");
  });
  it("sin dato", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});
