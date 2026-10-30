import { describe, expect, it } from "vitest";
import { ipAllowed } from "../ip-allowlist";

describe("ipAllowed", () => {
  it("sin allowlist permite cualquier IP (incluida unknown)", () => {
    expect(ipAllowed("203.0.113.5", [])).toBe(true);
    expect(ipAllowed("unknown", [])).toBe(true);
  });

  it("IPv4 exacta", () => {
    expect(ipAllowed("203.0.113.5", ["203.0.113.5"])).toBe(true);
    expect(ipAllowed("203.0.113.6", ["203.0.113.5"])).toBe(false);
  });

  it("IPv4 por CIDR", () => {
    expect(ipAllowed("203.0.113.5", ["203.0.113.0/24"])).toBe(true);
    expect(ipAllowed("203.0.114.5", ["203.0.113.0/24"])).toBe(false);
    expect(ipAllowed("10.1.2.3", ["0.0.0.0/0"])).toBe(true);
  });

  it("IPv6 exacta y CIDR", () => {
    expect(ipAllowed("::1", ["::1"])).toBe(true);
    expect(ipAllowed("2001:db8::1", ["2001:db8::/32"])).toBe(true);
    expect(ipAllowed("2001:db9::1", ["2001:db8::/32"])).toBe(false);
  });

  it("no mezcla IPv4 con IPv6", () => {
    expect(ipAllowed("203.0.113.5", ["2001:db8::/32"])).toBe(false);
    expect(ipAllowed("2001:db8::1", ["203.0.113.0/24"])).toBe(false);
  });

  it("unknown nunca pasa si hay allowlist", () => {
    expect(ipAllowed("unknown", ["203.0.113.0/24"])).toBe(false);
  });

  it("ignora entradas vacías o inválidas", () => {
    expect(ipAllowed("203.0.113.5", ["", "no-es-ip", "203.0.113.5"])).toBe(true);
    expect(ipAllowed("203.0.113.5", ["no-es-ip"])).toBe(false);
  });
});
