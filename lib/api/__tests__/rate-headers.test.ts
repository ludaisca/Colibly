import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));

import { ApiError, withApiErrors } from "@/lib/api/respond";
import { setRateLimitInfo } from "@/lib/api/rate-headers";

describe("headers de límite de velocidad", () => {
  it("se agregan a las respuestas exitosas", async () => {
    const handler = withApiErrors(async (req: Request) => {
      setRateLimitInfo(req, { limit: 120, remaining: 87, resetAt: Date.now() + 41_500 });
      return Response.json({ ok: true });
    });
    const res = await handler(new Request("https://app.test/api/v1/me"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("87");
    expect(Number(res.headers.get("X-RateLimit-Reset"))).toBe(42);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("el 429 lleva Retry-After", async () => {
    const handler = withApiErrors(async (req: Request) => {
      setRateLimitInfo(req, { limit: 120, remaining: 0, resetAt: Date.now() + 9_000 });
      throw new ApiError(429, "rate_limited", "Límite excedido");
    });
    const res = await handler(new Request("https://app.test/api/v1/contacts"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("9");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect((await res.json()).error.code).toBe("rate_limited");
  });

  it("sin autenticar (401) no inventa headers", async () => {
    const handler = withApiErrors(async () => {
      throw new ApiError(401, "unauthorized", "Falta la API key");
    });
    const res = await handler(new Request("https://app.test/api/v1/me"));
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });
});
