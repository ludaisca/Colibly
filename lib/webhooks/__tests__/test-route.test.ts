import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ apiAccess: true, add: vi.fn(), createDelivery: vi.fn(async () => ({ id: "d1" })), findFirst: vi.fn(async () => ({ id: "w1", active: true, userId: "u1" })) }));
vi.mock("@/lib/prisma", () => ({ prisma: { webhookEndpoint: { findFirst: () => db.findFirst() } } }));
vi.mock("@/lib/queue", () => ({ webhookDeliveryQueue: { add: (...a: unknown[]) => db.add(...a) } }));
vi.mock("@/lib/integrations/admin-session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/webhooks/fanout", () => ({ createDelivery: () => db.createDelivery() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, resetAt: 0 })) }));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/tenancy", () => ({ orgWhere: vi.fn(async () => ({ organizationId: "org1" })), requireOrgId: vi.fn(async () => "org1") }));
vi.mock("@/lib/billing/gates", () => ({ USERS_PATH: "/usuarios" }));
// El candado es la licencia del dueño del endpoint (admin con webhooks).
vi.mock("@/lib/billing/entitlements", () => ({
  integrationFeatureMessage: vi.fn(async () => (db.apiAccess ? null : "Solo un admin con licencia Pro puede usar webhooks.")),
}));

import { POST } from "@/app/api/configuracion/webhooks/[id]/test/route";

const call = () => POST(new Request("https://app.test/api/configuracion/webhooks/w1/test", { method: "POST" }), { params: Promise.resolve({ id: "w1" }) });

describe("botón Probar webhook: candado de la licencia del dueño", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.apiAccess = true;
  });

  it("sin webhooks en el plan responde 402 y no crea ni encola ninguna entrega", async () => {
    db.apiAccess = false;
    const res = await call();
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("plan_limit");
    expect(db.createDelivery).not.toHaveBeenCalled();
    expect(db.add).not.toHaveBeenCalled();
  });

  it("en Pro encola la entrega de prueba", async () => {
    const res = await call();
    expect(res.status).toBe(202);
    expect(db.add).toHaveBeenCalledTimes(1);
  });
});
