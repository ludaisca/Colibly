import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { status: "end" as string, counter: 0 };
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    get status() { return state.status; },
    multi: () => {
      const ops: string[] = [];
      const chain = {
        incr: () => (ops.push("incr"), chain),
        expire: () => (ops.push("expire"), chain),
        exec: async () => ops.map((op) => [null, op === "incr" ? ++state.counter : 1]),
      };
      return chain;
    },
    decr: async () => --state.counter,
  }),
}));

import { consumeDailyQuota, endOfUtcDay, rateLimit, RateLimitUnavailableError } from "@/lib/rate-limit";
import { databaseUrlWithPool } from "@/lib/prisma";

beforeEach(() => {
  state.status = "end";
  state.counter = 0;
});

describe("rateLimit sin Redis", () => {
  it("fail-closed lanza RateLimitUnavailableError", async () => {
    await expect(rateLimit("t1", 5, 60, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("sin failClosed sigue contando en memoria (resto de la app)", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("t2", 3, 60)).allowed).toBe(true);
    expect((await rateLimit("t2", 3, 60)).allowed).toBe(false);
  });
});

describe("cupo diario", () => {
  it("permite hasta el máximo y no cuenta los rechazados", async () => {
    state.status = "ready";
    expect((await consumeDailyQuota("org", 2)).allowed).toBe(true);
    expect((await consumeDailyQuota("org", 2)).remaining).toBe(0);
    const third = await consumeDailyQuota("org", 2);
    expect(third.allowed).toBe(false);
    expect(state.counter).toBe(2);
  });

  it("sin Redis es fail-closed", async () => {
    await expect(consumeDailyQuota("org", 2)).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("se renueva a las 00:00 UTC", () => {
    expect(new Date(endOfUtcDay(Date.parse("2026-10-19T23:59:00Z"))).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("pool de Prisma", () => {
  const url = "postgresql://u:p@db:5432/colibly_db";
  it("agrega connection_limit y pool_timeout si se configuran", () => {
    expect(databaseUrlWithPool(url, { DB_CONNECTION_LIMIT: "20", DB_POOL_TIMEOUT: "10" } as unknown as NodeJS.ProcessEnv)).toBe(`${url}?connection_limit=20&pool_timeout=10`);
    expect(databaseUrlWithPool(`${url}?schema=public`, { DB_CONNECTION_LIMIT: "8" } as unknown as NodeJS.ProcessEnv)).toBe(`${url}?schema=public&connection_limit=8`);
  });
  it("respeta la URL si ya trae connection_limit o no hay env", () => {
    expect(databaseUrlWithPool(`${url}?connection_limit=5`, { DB_CONNECTION_LIMIT: "20" } as unknown as NodeJS.ProcessEnv)).toBe(`${url}?connection_limit=5`);
    expect(databaseUrlWithPool(url, {} as unknown as NodeJS.ProcessEnv)).toBe(url);
  });
});
