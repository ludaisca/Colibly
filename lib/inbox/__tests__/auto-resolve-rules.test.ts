import { describe, expect, it } from "vitest";
import { autoResolveCutoff, shouldAutoResolve } from "../auto-resolve-rules";

const NOW = new Date("2026-11-01T18:00:00Z");
const config = { afterHours: 24, skipWaiting: true };
const base = {
  status: "OPEN" as const,
  lastMessageAt: new Date("2026-10-31T10:00:00Z"), // 32 h antes
  snoozedUntil: null,
  waitingSince: null,
};

describe("autoResolveCutoff", () => {
  it("apagado, fuera de rango o no entero → null", () => {
    expect(autoResolveCutoff({ afterHours: null, skipWaiting: true }, NOW)).toBeNull();
    expect(autoResolveCutoff({ afterHours: 0, skipWaiting: true }, NOW)).toBeNull();
    expect(autoResolveCutoff({ afterHours: 721, skipWaiting: true }, NOW)).toBeNull();
    expect(autoResolveCutoff({ afterHours: 1.5, skipWaiting: true }, NOW)).toBeNull();
  });

  it("resta las horas", () => {
    expect(autoResolveCutoff(config, NOW)?.toISOString()).toBe("2026-10-31T18:00:00.000Z");
  });
});

describe("shouldAutoResolve", () => {
  it("inactivo más de N horas → sí", () => {
    expect(shouldAutoResolve(base, config, NOW)).toBe(true);
    expect(shouldAutoResolve({ ...base, status: "PENDING" }, config, NOW)).toBe(true);
  });

  it("actividad reciente, sin mensajes o ya resuelto → no", () => {
    expect(shouldAutoResolve({ ...base, lastMessageAt: new Date("2026-11-01T10:00:00Z") }, config, NOW)).toBe(false);
    expect(shouldAutoResolve({ ...base, lastMessageAt: null }, config, NOW)).toBe(false);
    expect(shouldAutoResolve({ ...base, status: "RESOLVED" }, config, NOW)).toBe(false);
  });

  it("posposición vigente → no; vencida → sí", () => {
    expect(shouldAutoResolve({ ...base, snoozedUntil: new Date("2026-11-02T00:00:00Z") }, config, NOW)).toBe(false);
    expect(shouldAutoResolve({ ...base, snoozedUntil: new Date("2026-11-01T00:00:00Z") }, config, NOW)).toBe(true);
  });

  it("cliente esperando: depende de skipWaiting", () => {
    const waiting = { ...base, waitingSince: new Date("2026-10-31T10:00:00Z") };
    expect(shouldAutoResolve(waiting, config, NOW)).toBe(false);
    expect(shouldAutoResolve(waiting, { ...config, skipWaiting: false }, NOW)).toBe(true);
  });
});
