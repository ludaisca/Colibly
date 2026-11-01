import { describe, expect, it } from "vitest";
import { addDaysKey, safeTimeZone, zonedDayKey, zonedDayStart, zonedHourAndDow, zoneOffsetMinutes } from "../zoned";

describe("zonedDayStart", () => {
  it("centro de México (UTC-6 todo el año)", () => {
    expect(zonedDayStart("2026-11-01", "America/Mexico_City").toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(zonedDayStart("2026-07-15", "America/Mexico_City").toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("Tijuana respeta el horario de verano", () => {
    expect(zonedDayStart("2026-07-15", "America/Tijuana").toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(zonedDayStart("2026-12-15", "America/Tijuana").toISOString()).toBe("2026-12-15T08:00:00.000Z");
  });

  it("Cancún (UTC-5)", () => {
    expect(zonedDayStart("2026-03-01", "America/Cancun").toISOString()).toBe("2026-03-01T05:00:00.000Z");
  });

  it("día del cambio de horario en Tijuana (2026-03-08)", () => {
    // El día empieza todavía en horario estándar (UTC-8).
    expect(zonedDayStart("2026-03-08", "America/Tijuana").toISOString()).toBe("2026-03-08T08:00:00.000Z");
    // El día siguiente ya es UTC-7.
    expect(zonedDayStart("2026-03-09", "America/Tijuana").toISOString()).toBe("2026-03-09T07:00:00.000Z");
  });

  it("clave inválida da fecha inválida", () => {
    expect(Number.isNaN(zonedDayStart("2026-13", "America/Mexico_City").getTime())).toBe(true);
  });
});

describe("zonedDayKey", () => {
  it("las 03:00 UTC todavía son el día anterior en México", () => {
    expect(zonedDayKey(new Date("2026-11-02T03:00:00Z"), "America/Mexico_City")).toBe("2026-11-01");
    expect(zonedDayKey(new Date("2026-11-02T07:00:00Z"), "America/Mexico_City")).toBe("2026-11-02");
  });
});

describe("zonedHourAndDow", () => {
  it("domingo 23:59 local", () => {
    // 2026-11-01 es domingo; 23:59 en CDMX = 05:59Z del lunes.
    expect(zonedHourAndDow(new Date("2026-11-02T05:59:00Z"), "America/Mexico_City")).toEqual({ hour: 23, dow: 0 });
  });

  it("medianoche local es hora 0 del lunes", () => {
    expect(zonedHourAndDow(new Date("2026-11-02T06:00:00Z"), "America/Mexico_City")).toEqual({ hour: 0, dow: 1 });
  });
});

describe("helpers", () => {
  it("offset y suma de días", () => {
    expect(zoneOffsetMinutes(new Date("2026-11-01T12:00:00Z"), "America/Mexico_City")).toBe(-360);
    expect(addDaysKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("zona inválida cae al respaldo", () => {
    expect(safeTimeZone("Marte/Olympus")).toBe("America/Mexico_City");
    expect(safeTimeZone("America/Tijuana")).toBe("America/Tijuana");
    expect(safeTimeZone(null)).toBe("America/Mexico_City");
  });
});
