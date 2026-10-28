import { describe, expect, it } from "vitest";
import { TURNSTILE_ACTION, turnstileAccepted, turnstileHostnames } from "@/lib/turnstile";

const prodHosts = turnstileHostnames("https://colibly.com", false);
const devHosts = turnstileHostnames("https://colibly.com", true);

function result(overrides: Partial<{ success: boolean; action: string; hostname: string }> = {}) {
  return { success: true, action: TURNSTILE_ACTION, hostname: "colibly.com", ...overrides };
}

describe("turnstileHostnames", () => {
  it("en producción solo el hostname de APP_URL", () => {
    expect([...prodHosts]).toEqual(["colibly.com"]);
  });

  it("en desarrollo suma localhost y 127.0.0.1", () => {
    expect([...devHosts].sort()).toEqual(["127.0.0.1", "colibly.com", "localhost"]);
  });

  it("ignora una APP_URL inválida", () => {
    expect(turnstileHostnames("no-es-una-url", false).size).toBe(0);
    expect(turnstileHostnames(null, false).size).toBe(0);
  });
});

describe("turnstileAccepted", () => {
  it("acepta un token con la acción y el hostname esperados", () => {
    expect(turnstileAccepted(result(), { hostnames: prodHosts, dev: false })).toBe(true);
  });

  it("rechaza success falso, acción distinta o sin hostname", () => {
    expect(turnstileAccepted(result({ success: false }), { hostnames: prodHosts, dev: false })).toBe(false);
    expect(turnstileAccepted(result({ action: "login" }), { hostnames: prodHosts, dev: false })).toBe(false);
    expect(turnstileAccepted(result({ action: "" }), { hostnames: prodHosts, dev: false })).toBe(false);
    expect(turnstileAccepted(result({ hostname: "" }), { hostnames: prodHosts, dev: false })).toBe(false);
  });

  it("rechaza un token resuelto en otro dominio", () => {
    expect(turnstileAccepted(result({ hostname: "evil.example" }), { hostnames: prodHosts, dev: false })).toBe(false);
  });

  it("en producción rechaza localhost aunque Meta lo devuelva", () => {
    expect(turnstileAccepted(result({ hostname: "localhost" }), { hostnames: prodHosts, dev: false })).toBe(false);
  });

  it("en desarrollo permite localhost y el nombre corto de Tailscale", () => {
    expect(turnstileAccepted(result({ hostname: "localhost" }), { hostnames: devHosts, dev: true })).toBe(true);
    expect(turnstileAccepted(result({ hostname: "ludaisca" }), { hostnames: devHosts, dev: true })).toBe(true);
    // Un dominio con punto sigue exigiendo estar en la lista.
    expect(turnstileAccepted(result({ hostname: "evil.example" }), { hostnames: devHosts, dev: true })).toBe(false);
  });
});
