import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { nextOnboardingStep } = await import("../onboarding");

const step = (key: "email" | "channel" | "automation" | "team" | "plan", done: boolean, href: string | null = "/x") => ({ key, title: key, description: "", href, done });

describe("nextOnboardingStep", () => {
  it("toma el primer paso pendiente con enlace, saltando el que no lo tiene", () => {
    const next = nextOnboardingStep([step("email", false, null), step("channel", false, "/whatsapp/cuentas"), step("automation", false)]);
    expect(next?.step.key).toBe("channel");
    expect(next?.cta).toBe("Conectar WhatsApp");
  });
  it("sin canal ofrece probar el bot mientras tanto", () => {
    expect(nextOnboardingStep([step("channel", false)])?.secondary).toEqual({ label: "Mientras tanto, prueba tu bot", href: "/whatsapp/bots" });
  });
  it("con otro paso pendiente no hay botón secundario", () => {
    expect(nextOnboardingStep([step("channel", true), step("automation", false)])?.secondary).toBeNull();
  });
  it("todo hecho: no hay tarjeta", () => {
    expect(nextOnboardingStep([step("channel", true), step("plan", true)])).toBeNull();
  });
});
