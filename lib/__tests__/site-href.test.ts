import { afterEach, describe, expect, it, vi } from "vitest";
import { isAppHost, siteHref } from "@/lib/app-url";

afterEach(() => vi.unstubAllEnvs());

describe("siteHref", () => {
  it("en el sitio deja el enlace relativo", () => {
    expect(siteHref("/precios", false)).toBe("/precios");
  });
  it("en el host de la app lo hace absoluto al sitio", () => {
    vi.stubEnv("SITE_URL", "https://colibly.com");
    expect(siteHref("/#producto", true)).toBe("https://colibly.com/#producto");
  });
});

describe("isAppHost", () => {
  it("solo con dominios separados y el host de la app", () => {
    vi.stubEnv("SITE_URL", "https://colibly.com");
    vi.stubEnv("APP_URL", "https://app.colibly.com");
    expect(isAppHost("app.colibly.com")).toBe(true);
    expect(isAppHost("colibly.com")).toBe(false);
  });
  it("en dev (un solo host) nunca", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("APP_URL", "http://localhost:1100");
    expect(isAppHost("localhost")).toBe(false);
  });
});
