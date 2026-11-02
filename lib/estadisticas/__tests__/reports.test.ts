import { describe, expect, it } from "vitest";
import { parseReportRange } from "../reports";

describe("parseReportRange", () => {
  it("respeta el rango explícito y usa un límite exclusivo", () => {
    const range = parseReportRange("2026-10-01", "2026-10-31");
    expect(range.fromKey).toBe("2026-10-01");
    expect(range.toKey).toBe("2026-10-31");
    expect(range.to.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });

  it("recorta a 90 días", () => {
    const range = parseReportRange("2020-01-01", "2026-10-31");
    expect(range.fromKey).toBe("2026-08-03");
    expect(range.toKey).toBe("2026-10-31");
  });

  it("cae al rango por defecto si las fechas son inválidas", () => {
    const range = parseReportRange("no-es-fecha", "tampoco");
    expect(range.fromKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.toKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.from < range.to).toBe(true);
  });
});
