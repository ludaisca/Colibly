import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ internal: false, keys: 0, webhooks: 0, keyWhere: null as unknown }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn(async () => ({ isInternal: db.internal })) },
    apiKey: { count: vi.fn(async (args: { where: unknown }) => { db.keyWhere = args.where; return db.keys; }) },
    webhookEndpoint: { count: vi.fn(async () => db.webhooks) },
  },
}));

import { apiKeyCapExceeded, MAX_ACTIVE_API_KEYS, MAX_WEBHOOKS, webhookCapExceeded } from "@/lib/api/limits";

describe("topes de API keys y webhooks por organización", () => {
  beforeEach(() => {
    db.internal = false;
    db.keys = 0;
    db.webhooks = 0;
  });

  it("10 y 10", () => {
    expect(MAX_ACTIVE_API_KEYS).toBe(10);
    expect(MAX_WEBHOOKS).toBe(10);
  });

  it("permite hasta 9 y bloquea la 11.ª con mensaje claro", async () => {
    db.keys = 9;
    expect(await apiKeyCapExceeded("org1")).toBeNull();
    db.keys = 10;
    const cap = await apiKeyCapExceeded("org1");
    expect(cap?.max).toBe(10);
    expect(cap?.message).toMatch(/10 API keys activas.*Revoca/);
  });

  it("solo cuenta keys activas (no revocadas ni vencidas) de la organización", async () => {
    await apiKeyCapExceeded("org1");
    expect(db.keyWhere).toMatchObject({ organizationId: "org1", revokedAt: null });
    expect(JSON.stringify(db.keyWhere)).toContain("expiresAt");
  });

  it("webhooks: bloquea al llegar a 10", async () => {
    db.webhooks = 10;
    expect((await webhookCapExceeded("org1"))?.message).toMatch(/10 webhooks.*Borra/);
  });

  it("las cuentas internas no tienen tope", async () => {
    db.internal = true;
    db.keys = 50;
    db.webhooks = 50;
    expect(await apiKeyCapExceeded("org1")).toBeNull();
    expect(await webhookCapExceeded("org1")).toBeNull();
  });
});
