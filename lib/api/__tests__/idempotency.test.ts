import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const keyRow = vi.hoisted(() => ({ value: { organizationId: "org1", revokedAt: null as Date | null, expiresAt: null as Date | null } as unknown }));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { apiKey: { findUnique: vi.fn(async () => keyRow.value) } },
}));

import { canonicalJson, withIdempotency } from "@/lib/api/idempotency";

const post = (body: unknown, key?: string, path = "/api/v1/messages") =>
  new Request(`https://app.test${path}`, {
    method: "POST",
    headers: { authorization: "Bearer sk_live_abc", "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("withIdempotency", () => {
  let calls: number;
  let status: number;
  const handler = withIdempotency(async (req: Request) => {
    calls++;
    const body = await req.json();
    return Response.json({ n: calls, echo: body }, { status });
  });

  beforeEach(() => {
    store.clear();
    calls = 0;
    status = 201;
    keyRow.value = { organizationId: "org1", revokedAt: null, expiresAt: null };
  });

  it("sin header no guarda nada", async () => {
    await handler(post({ a: 1 }));
    await handler(post({ a: 1 }));
    expect(calls).toBe(2);
    expect(store.size).toBe(0);
  });

  it("misma clave y mismo cuerpo: reproduce la respuesta sin volver a ejecutar", async () => {
    const first = await handler(post({ text: "hola", conversationId: "c1" }, "k-1"));
    const again = await handler(post({ conversationId: "c1", text: "hola" }, "k-1")); // otro orden de claves
    expect(calls).toBe(1);
    expect(again.status).toBe(201);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await again.json()).toEqual(await first.json());
  });

  it("misma clave con otro cuerpo → 422 idempotency_conflict", async () => {
    await handler(post({ text: "hola" }, "k-2"));
    const res = await handler(post({ text: "adiós" }, "k-2"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("idempotency_conflict");
    expect(calls).toBe(1);
  });

  it("misma clave en otro endpoint también es conflicto", async () => {
    await handler(post({ a: 1 }, "k-3"));
    const res = await handler(post({ a: 1 }, "k-3", "/api/v1/contacts"));
    expect(res.status).toBe(422);
  });

  it("mientras la primera sigue en curso → 409", async () => {
    let release!: () => void;
    const slow = withIdempotency(async () => {
      await new Promise<void>((r) => (release = r));
      return Response.json({ ok: true }, { status: 201 });
    });
    const pending = slow(post({ a: 1 }, "k-4"));
    await new Promise((r) => setTimeout(r, 5));
    const second = await slow(post({ a: 1 }, "k-4"));
    expect(second.status).toBe(409);
    release();
    expect((await pending).status).toBe(201);
  });

  it("no guarda 5xx ni 429: se puede reintentar con la misma clave", async () => {
    status = 500;
    await handler(post({ a: 1 }, "k-5"));
    status = 429;
    await handler(post({ a: 1 }, "k-5"));
    status = 201;
    const ok = await handler(post({ a: 1 }, "k-5"));
    expect(calls).toBe(3);
    expect(ok.headers.get("Idempotent-Replayed")).toBeNull();
  });

  it("guarda errores de negocio (422 window_closed) para no reintentar en vano", async () => {
    status = 422;
    await handler(post({ a: 1 }, "k-6"));
    const again = await handler(post({ a: 1 }, "k-6"));
    expect(calls).toBe(1);
    expect(again.status).toBe(422);
  });

  it("las claves son por organización", async () => {
    await handler(post({ a: 1 }, "k-7"));
    keyRow.value = { organizationId: "org2", revokedAt: null, expiresAt: null };
    await handler(post({ a: 1 }, "k-7"));
    expect(calls).toBe(2);
  });

  it("una key revocada no reproduce respuestas guardadas (pasa al handler, que responde 401)", async () => {
    await handler(post({ a: 1 }, "k-8"));
    keyRow.value = { organizationId: "org1", revokedAt: new Date(), expiresAt: null };
    await handler(post({ a: 1 }, "k-8"));
    expect(calls).toBe(2);
  });

  it("rechaza claves vacías o con caracteres no imprimibles", async () => {
    const res = await handler(post({ a: 1 }, "con espacio"));
    expect(res.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("canonicalJson ordena claves a cualquier profundidad", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});
