import { describe, expect, it } from "vitest";
import { PRESENCE_TIMEOUT_MS, effectiveAvailability, filterAssignableCandidates } from "../availability-rules";

const now = Date.parse("2026-11-01T18:00:00Z");
const ago = (ms: number) => new Date(now - ms);

describe("effectiveAvailability", () => {
  it("en línea con latido reciente", () => {
    expect(effectiveAvailability({ availability: "ONLINE", lastSeenAt: ago(30_000) }, now)).toBe("ONLINE");
  });
  it("sin latido o con latido viejo cuenta como desconectado", () => {
    expect(effectiveAvailability({ availability: "ONLINE", lastSeenAt: null }, now)).toBe("OFFLINE");
    expect(effectiveAvailability({ availability: "ONLINE", lastSeenAt: ago(PRESENCE_TIMEOUT_MS + 1) }, now)).toBe("OFFLINE");
    expect(effectiveAvailability({ availability: "BUSY", lastSeenAt: ago(PRESENCE_TIMEOUT_MS + 1) }, now)).toBe("OFFLINE");
  });
  it("ocupado se respeta mientras siga conectado; desconectado elegido gana", () => {
    expect(effectiveAvailability({ availability: "BUSY", lastSeenAt: ago(1000) }, now)).toBe("BUSY");
    expect(effectiveAvailability({ availability: "OFFLINE", lastSeenAt: ago(1000) }, now)).toBe("OFFLINE");
  });
  it("acepta fechas en texto (JSON del cliente)", () => {
    expect(effectiveAvailability({ availability: "ONLINE", lastSeenAt: ago(1000).toISOString() }, now)).toBe("ONLINE");
  });
});

describe("filterAssignableCandidates", () => {
  const users = [
    { id: "on", availability: "ONLINE" as const, lastSeenAt: ago(10_000) },
    { id: "busy", availability: "BUSY" as const, lastSeenAt: ago(10_000) },
    { id: "gone", availability: "ONLINE" as const, lastSeenAt: ago(PRESENCE_TIMEOUT_MS * 3) },
    { id: "off", availability: "OFFLINE" as const, lastSeenAt: ago(10_000) },
  ];
  it("apagado: no filtra a nadie (comportamiento anterior)", () => {
    expect(filterAssignableCandidates(users, false, now)).toEqual(["on", "busy", "gone", "off"]);
  });
  it("encendido: solo los que están en línea de verdad", () => {
    expect(filterAssignableCandidates(users, true, now)).toEqual(["on"]);
  });
  it("encendido y nadie en línea: lista vacía (el chat queda sin asignar)", () => {
    expect(filterAssignableCandidates(users.slice(1), true, now)).toEqual([]);
  });
});
