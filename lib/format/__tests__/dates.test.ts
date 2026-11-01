import { describe, expect, it } from "vitest";
import { formatInZone, formatRelative, minutesSince } from "../dates";

const NOW = new Date("2026-11-01T18:00:00Z");

describe("formatRelative", () => {
  it.each([
    ["2026-11-01T17:59:40Z", "ahora"],
    ["2026-11-01T17:55:00Z", "hace 5 min"],
    ["2026-11-01T15:00:00Z", "hace 3 h"],
    ["2026-10-31T17:00:00Z", "ayer"],
    ["2026-10-29T18:00:00Z", "hace 3 días"],
    ["2026-09-01T18:00:00Z", "hace 2 meses"],
    ["2024-10-01T18:00:00Z", "hace 2 años"],
    ["2026-11-01T18:10:00Z", "en 10 min"],
    ["2026-11-02T19:00:00Z", "mañana"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, NOW)).toBe(expected);
  });

  it("fecha inválida da texto vacío", () => {
    expect(formatRelative("nope", NOW)).toBe("");
  });
});

describe("minutesSince", () => {
  it("cuenta minutos completos y nunca negativo", () => {
    expect(minutesSince("2026-11-01T17:30:30Z", NOW)).toBe(29);
    expect(minutesSince("2026-11-01T19:00:00Z", NOW)).toBe(0);
    expect(minutesSince(null, NOW)).toBe(0);
  });
});

describe("formatInZone", () => {
  it("usa la zona indicada", () => {
    expect(formatInZone("2026-11-02T03:00:00Z", { day: "numeric", month: "numeric" }, "America/Mexico_City")).toBe("1/11");
  });
});
