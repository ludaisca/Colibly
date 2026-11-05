import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Dobles ──
const rateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, rateLimit: (...args: unknown[]) => rateLimitMock(...args) };
});
const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({ prisma: { apiKey: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a), findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/billing/gates", () => ({ hasApiAccess: vi.fn().mockResolvedValue(true), isOrgWritable: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/billing/entitlements", () => ({ integrationOwnerHas: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/integrations/account-scope", () => ({ resolveIntegrationScope: vi.fn().mockResolvedValue({ accountIds: ["wa1"], channelAccountIds: [] }) }));
vi.mock("@/lib/net/client-ip", () => ({ clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
const cache = new Map<string, unknown>();
vi.mock("@/lib/api/auth-cache", () => ({
  getCachedApiKey: async (h: string) => cache.get(`k:${h}`) ?? null,
  setCachedApiKey: async (h: string, v: unknown) => void cache.set(`k:${h}`, structuredClone(v)),
  getCachedOrgAccess: async (o: string) => cache.get(`o:${o}`) ?? null,
  setCachedOrgAccess: async (o: string, v: unknown) => void cache.set(`o:${o}`, v),
}));

import { authenticateApiKey } from "@/lib/api/auth";
import { withApiErrors } from "@/lib/api/respond";
import { RateLimitUnavailableError } from "@/lib/rate-limit";
import { API_ORG_REQUESTS_PER_MINUTE, API_REQUESTS_PER_MINUTE } from "@/lib/api/constants";

const SECRET = "sk_live_testtesttesttesttesttesttesttesttesttes";
const keyRow = {
  id: "key1", userId: "u1", organizationId: "org1", scopes: ["contacts:read"], accountIds: [], channelAccountIds: [],
  revokedAt: null, expiresAt: null, lastUsedAt: new Date(), user: { role: "admin", disabledAt: null },
};
const req = () => new Request("https://app.test/api/v1/me", { headers: { authorization: `Bearer ${SECRET}` } });
const handler = withApiErrors(async (r: Request) => {
  await authenticateApiKey(r);
  return Response.json({ ok: true });
});
const allow = (remaining: number) => ({ allowed: true, remaining, resetAt: Date.now() + 30_000 });

beforeEach(() => {
  cache.clear();
  rateLimitMock.mockReset();
  findUnique.mockReset().mockResolvedValue(keyRow);
});

describe("límites en capas de la API pública", () => {
  it("aplica IP, key y organización, todos fail-closed", async () => {
    rateLimitMock.mockResolvedValue(allow(50));
    const res = await handler(req());
    expect(res.status).toBe(200);
    const keys = rateLimitMock.mock.calls.map((c) => [c[0], c[1], c[3]]);
    expect(keys).toEqual([
      ["api-ip:203.0.113.7", 3000, { failClosed: true }],
      ["api:key1", API_REQUESTS_PER_MINUTE, { failClosed: true }],
      ["api-org:org1", API_ORG_REQUESTS_PER_MINUTE, { failClosed: true }],
    ]);
  });

  it("informa el límite más ajustado en los headers", async () => {
    rateLimitMock
      .mockResolvedValueOnce(allow(2900)) // ip
      .mockResolvedValueOnce(allow(100)) // key
      .mockResolvedValueOnce(allow(7)); // org
    const res = await handler(req());
    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(API_ORG_REQUESTS_PER_MINUTE));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("7");
    expect(res.headers.get("X-RateLimit-Scope")).toBe("organization");
  });

  it("429 por organización aunque la key tenga cupo", async () => {
    rateLimitMock
      .mockResolvedValueOnce(allow(2900))
      .mockResolvedValueOnce(allow(100))
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 9_000 });
    const res = await handler(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Scope")).toBe("organization");
    expect(res.headers.get("Retry-After")).toBe("9");
    expect((await res.json()).error.code).toBe("rate_limited");
  });

  it("503 con Retry-After si Redis no está disponible (sin respaldo en memoria)", async () => {
    rateLimitMock.mockRejectedValue(new RateLimitUnavailableError());
    const res = await handler(req());
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect((await res.json()).error.code).toBe("service_unavailable");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("la segunda solicitud sale del caché (sin consultar la key ni el alcance)", async () => {
    rateLimitMock.mockResolvedValue(allow(50));
    const { resolveIntegrationScope } = await import("@/lib/integrations/account-scope");
    vi.mocked(resolveIntegrationScope).mockClear();
    await handler(req());
    await handler(req());
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(resolveIntegrationScope).toHaveBeenCalledTimes(1);
  });
});
