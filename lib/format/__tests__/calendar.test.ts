import { describe, expect, it } from "vitest";
import { formatCalendarDate, fromISO, isOutOfBounds, monthGrid, moveByKey, pickInRange, toISO } from "../calendar";

describe("fromISO / toISO", () => {
  it("convierte ida y vuelta", () => {
    expect(toISO(fromISO("2026-11-07")!)).toBe("2026-11-07");
  });
  it("rechaza fechas que no existen o mal escritas", () => {
    expect(fromISO("2026-02-30")).toBeNull();
    expect(fromISO("07/11/2026")).toBeNull();
    expect(fromISO("")).toBeNull();
  });
});

describe("monthGrid", () => {
  it("empieza en lunes y cubre 6 semanas", () => {
    const grid = monthGrid(new Date(2026, 10, 1)); // noviembre 2026 empieza en domingo
    expect(grid).toHaveLength(42);
    expect(toISO(grid[0])).toBe("2026-10-26");
    expect(grid[0].getDay()).toBe(1);
    expect(grid.some((d) => toISO(d) === "2026-11-30")).toBe(true);
  });
});

describe("moveByKey", () => {
  const base = new Date(2026, 0, 31); // 31 ene 2026, sábado
  it("flechas mueven día y semana", () => {
    expect(toISO(moveByKey(base, "ArrowRight")!)).toBe("2026-02-01");
    expect(toISO(moveByKey(base, "ArrowUp")!)).toBe("2026-01-24");
  });
  it("Av Pág recorta al último día del mes", () => {
    expect(toISO(moveByKey(base, "PageDown")!)).toBe("2026-02-28");
  });
  it("Mayús + Re Pág retrocede un año", () => {
    expect(toISO(moveByKey(base, "PageUp", true)!)).toBe("2025-01-31");
  });
  it("Inicio y Fin van a lunes y domingo", () => {
    expect(toISO(moveByKey(base, "Home")!)).toBe("2026-01-26");
    expect(toISO(moveByKey(base, "End")!)).toBe("2026-02-01");
  });
  it("otras teclas no mueven", () => {
    expect(moveByKey(base, "Enter")).toBeNull();
  });
});

describe("pickInRange", () => {
  it("abre, cierra y reinicia el rango", () => {
    const a = pickInRange({ start: null, end: null }, "2026-11-10");
    expect(a).toEqual({ start: "2026-11-10", end: null });
    const b = pickInRange(a, "2026-11-20");
    expect(b).toEqual({ start: "2026-11-10", end: "2026-11-20" });
    expect(pickInRange(b, "2026-11-05")).toEqual({ start: "2026-11-05", end: null });
  });
  it("un día anterior al inicio reemplaza el inicio", () => {
    expect(pickInRange({ start: "2026-11-10", end: null }, "2026-11-01")).toEqual({ start: "2026-11-01", end: null });
  });
});

describe("límites y formato", () => {
  it("respeta min y max", () => {
    expect(isOutOfBounds("2026-11-01", "2026-11-02")).toBe(true);
    expect(isOutOfBounds("2026-11-03", "2026-11-02", "2026-11-30")).toBe(false);
    expect(isOutOfBounds("2026-12-01", undefined, "2026-11-30")).toBe(true);
  });
  it("formatea en español de México", () => {
    expect(formatCalendarDate("2026-10-14")).toMatch(/14 oct 2026/);
    expect(formatCalendarDate("x")).toBe("");
  });
});
