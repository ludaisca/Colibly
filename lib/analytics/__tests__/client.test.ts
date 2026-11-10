import { describe, expect, it } from "vitest";
import { consentCookieDomain, withCampaignParams } from "../client";

describe("consentCookieDomain", () => {
  it("usa el dominio raíz solo en colibly.com y sus subdominios", () => {
    expect(consentCookieDomain("colibly.com")).toBe("colibly.com");
    expect(consentCookieDomain("app.colibly.com")).toBe("colibly.com");
    expect(consentCookieDomain("localhost")).toBeNull();
    expect(consentCookieDomain("ludaisca.taila2291d.ts.net")).toBeNull();
    expect(consentCookieDomain("notcolibly.com")).toBeNull();
  });
});

describe("withCampaignParams", () => {
  const base = "https://colibly.com/";
  it("copia la campaña al enlace de registro", () => {
    expect(withCampaignParams("/register", "?utm_source=a&gclid=x&otro=1", base)).toBe("https://colibly.com/register?utm_source=a&gclid=x");
  });
  it("funciona con el enlace absoluto a la app y no pisa valores propios", () => {
    expect(withCampaignParams("https://app.colibly.com/register?utm_source=z", "?utm_source=a&fbclid=f", base)).toBe("https://app.colibly.com/register?utm_source=z&fbclid=f");
  });
  it("ignora otros enlaces y los casos sin nada que agregar", () => {
    expect(withCampaignParams("/precios", "?utm_source=a", base)).toBeNull();
    expect(withCampaignParams("/register", "?otro=1", base)).toBeNull();
    expect(withCampaignParams("/register?utm_source=a", "?utm_source=b", base)).toBeNull();
  });
});
