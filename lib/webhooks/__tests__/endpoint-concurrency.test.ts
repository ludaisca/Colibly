import { beforeEach, describe, expect, it, vi } from "vitest";

const counters = new Map<string, number>();
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    multi: () => {
      let key = "";
      const chain = {
        incr: (k: string) => ((key = k), chain),
        expire: () => chain,
        exec: async () => {
          counters.set(key, (counters.get(key) ?? 0) + 1);
          return [[null, counters.get(key)], [null, 1]];
        },
      };
      return chain;
    },
    decr: async (k: string) => {
      counters.set(k, (counters.get(k) ?? 0) - 1);
      return counters.get(k)!;
    },
    set: async (k: string, v: number) => void counters.set(k, v),
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => s }));
vi.mock("@/lib/net/safe-fetch", () => ({ safeFetch: vi.fn(), SafeFetchError: class extends Error {} }));
vi.mock("@/lib/queue", () => ({ WEBHOOK_DELIVERY_ATTEMPTS: 6 }));

import { acquireEndpointSlot, releaseEndpointSlot } from "@/lib/webhooks/deliver";

beforeEach(() => counters.clear());

describe("concurrencia por endpoint de webhooks", () => {
  it("como mucho 2 entregas a la vez al mismo endpoint", async () => {
    expect(await acquireEndpointSlot("ep1", 2)).toBe(true);
    expect(await acquireEndpointSlot("ep1", 2)).toBe(true);
    expect(await acquireEndpointSlot("ep1", 2)).toBe(false);
    // Otro endpoint no se ve afectado por el lento.
    expect(await acquireEndpointSlot("ep2", 2)).toBe(true);
    await releaseEndpointSlot("ep1");
    expect(await acquireEndpointSlot("ep1", 2)).toBe(true);
  });

  it("liberar nunca deja el contador bajo cero", async () => {
    await releaseEndpointSlot("ep3");
    expect(counters.get("webhook-inflight:ep3")).toBe(0);
  });
});
