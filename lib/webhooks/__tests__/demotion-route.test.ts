import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  target: { id: "u2", role: "admin", disabledAt: null as Date | null, ownedOrganization: null },
  pause: vi.fn(async (..._a: unknown[]) => 1),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })), invalidateUserSessionCache: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async () => db.target),
      count: vi.fn(async () => 2),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "u2", name: "Beto", email: "b@x.mx", role: data.role ?? "admin", disabledAt: data.disabledAt ?? null })),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: 0 })) }));
vi.mock("@/lib/tenancy", () => ({ requireOrgId: vi.fn(async () => "org1") }));
vi.mock("@/lib/billing/gates", () => ({ checkPlanLimit: vi.fn(async () => null) }));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/validations", async () => ({ emailField: (await import("zod")).z.string() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));
vi.mock("@/lib/webhooks/ownership", () => ({ pauseWebhooksOfUser: (...a: unknown[]) => db.pause(...a) }));

import { PATCH } from "@/app/api/usuarios/route";

const patch = (body: unknown) => PATCH(new Request("https://app.test/api/usuarios", { method: "PATCH", body: JSON.stringify(body) }));

describe("PATCH /api/usuarios pausa los webhooks de quien pierde el admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.target = { id: "u2", role: "admin", disabledAt: null, ownedOrganization: null };
  });

  it("al bajarlo a ejecutivo", async () => {
    expect((await patch({ userId: "u2", role: "ejecutivo" })).status).toBe(200);
    expect(db.pause).toHaveBeenCalledWith("u2", "org1", "demoted", "Beto");
  });

  it("al desactivarlo", async () => {
    await patch({ userId: "u2", disabled: true });
    expect(db.pause).toHaveBeenCalledWith("u2", "org1", "disabled", "Beto");
  });

  it("no toca nada si sigue siendo admin o no lo era", async () => {
    await patch({ userId: "u2", role: "admin" });
    db.target = { id: "u2", role: "user", disabledAt: null, ownedOrganization: null };
    await patch({ userId: "u2", role: "ejecutivo" });
    expect(db.pause).not.toHaveBeenCalled();
  });
});
