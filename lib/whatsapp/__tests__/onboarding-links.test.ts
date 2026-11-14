import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/events/emit", () => ({ emitDomainEvent: vi.fn() }));
vi.mock("@/lib/billing/gates", () => ({ evaluatePlanLimit: vi.fn(), isOrgWritable: vi.fn() }));
vi.mock("@/lib/billing/entitlements", () => ({ integrationOwnerHas: vi.fn() }));
vi.mock("@/lib/whatsapp/embedded-signup/service", () => ({ realEmbeddedSignupDeps: vi.fn(), requirePlatformApp: vi.fn() }));

import { onboardingLinkState, redirectWithResult } from "@/lib/whatsapp/onboarding-links";
import { parseWabaNumber } from "@/lib/whatsapp/account-admin";
import { apiDeregisterNumberSchema, apiOnboardingLinkSchema, apiRegisterNumberSchema, apiTwoStepPinSchema } from "@/lib/api/schemas";

describe("enlaces de conexión", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("un pendiente vencido se informa como EXPIRED", () => {
    expect(onboardingLinkState({ status: "PENDING", expiresAt: new Date("2026-11-14T11:00:00Z") }, now)).toBe("EXPIRED");
    expect(onboardingLinkState({ status: "PENDING", expiresAt: new Date("2026-11-15T11:00:00Z") }, now)).toBe("PENDING");
    expect(onboardingLinkState({ status: "COMPLETED", expiresAt: new Date("2026-11-14T11:00:00Z") }, now)).toBe("COMPLETED");
  });

  it("la URL de regreso conserva sus parámetros y agrega el resultado", () => {
    expect(redirectWithResult("https://crm.ejemplo.mx/listo?x=1", { status: "connected", accountId: "acc1", reference: "cli-9" }))
      .toBe("https://crm.ejemplo.mx/listo?x=1&status=connected&accountId=acc1&reference=cli-9");
  });

  it("valida el cuerpo de POST /onboarding-links", () => {
    expect(apiOnboardingLinkSchema.safeParse({ redirectUrl: "http://a.mx" }).success).toBe(false);
    expect(apiOnboardingLinkSchema.safeParse({ expiresInHours: 721 }).success).toBe(false);
    expect(apiOnboardingLinkSchema.safeParse({ name: "Sucursal Norte", reference: "cli-9", expiresInHours: 48 }).success).toBe(true);
  });
});

describe("números, PIN y registro", () => {
  it("lee la forma de Meta", () => {
    expect(parseWabaNumber({ id: "1", display_phone_number: "+52 55 1234 5678", quality_rating: "GREEN", is_on_biz_app: true, throughput: { level: "STANDARD" } })).toMatchObject({
      phoneNumberId: "1",
      displayPhoneNumber: "+52 55 1234 5678",
      qualityRating: "GREEN",
      isOnBizApp: true,
      throughput: "STANDARD",
      verifiedName: null,
    });
  });

  it("el PIN son 6 dígitos y la baja pide confirm", () => {
    expect(apiTwoStepPinSchema.safeParse({ pin: "12345" }).success).toBe(false);
    expect(apiTwoStepPinSchema.safeParse({ pin: "123456" }).success).toBe(true);
    expect(apiRegisterNumberSchema.safeParse({}).success).toBe(true);
    expect(apiDeregisterNumberSchema.safeParse({}).success).toBe(false);
    expect(apiDeregisterNumberSchema.safeParse({ confirm: true }).success).toBe(true);
  });
});
