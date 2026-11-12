import { describe, expect, it } from "vitest";
import { compactCount, yAxisWidth } from "../compact-number";

describe("compactCount", () => {
  it("cortas y sin decimales de sobra", () => {
    expect(compactCount(0)).toBe("0");
    expect(compactCount(950)).toBe("950");
    expect(compactCount(1200)).toBe("1.2k");
    expect(compactCount(8000)).toBe("8k");
    expect(compactCount(12_500)).toBe("13k");
    expect(compactCount(1_500_000)).toBe("1.5M");
  });
});

describe("yAxisWidth", () => {
  it("crece con la etiqueta y nunca baja de 28 px", () => {
    expect(yAxisWidth(5)).toBe(28);
    expect(yAxisWidth(8000)).toBeGreaterThanOrEqual(28);
    expect(yAxisWidth(1200)).toBeGreaterThan(yAxisWidth(950));
  });
});
