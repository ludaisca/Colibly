import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/tenancy", () => ({ orgWhere: vi.fn(), requireOrgId: vi.fn() }));
vi.mock("@/lib/shared-accounts", () => ({ getUserAccountIds: vi.fn(), getUserChannelAccountIds: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s }));
vi.mock("@/lib/api/limits", () => ({ webhookCapExceeded: vi.fn() }));
vi.mock("@/lib/billing/entitlements", () => ({ integrationFeatureMessage: vi.fn() }));

import { webhookCreateSchema, webhookUpdateSchema } from "../crud";

describe("webhookUpdateSchema", () => {
  // Zod 4 conserva los .default() en .partial(): un PATCH que solo renombraba
  // guardaba accountIds = [] y el webhook pasaba a recibir todas las cuentas.
  it("no inventa accountIds/channelAccountIds cuando el PATCH no los manda", () => {
    const parsed = webhookUpdateSchema.parse({ name: "Otro nombre" });
    expect(parsed).toEqual({ name: "Otro nombre" });
    expect("accountIds" in parsed).toBe(false);
    expect("channelAccountIds" in parsed).toBe(false);
  });

  it("respeta un [] explícito (quitar el recorte a propósito)", () => {
    expect(webhookUpdateSchema.parse({ accountIds: [] }).accountIds).toEqual([]);
  });
});

describe("webhookCreateSchema", () => {
  it("sin recorte de cuentas por defecto al crear", () => {
    const parsed = webhookCreateSchema.parse({ name: "n8n", url: "https://example.com/h", events: ["message.received"] });
    expect(parsed.accountIds).toEqual([]);
    expect(parsed.channelAccountIds).toEqual([]);
  });
});
