import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));

import { withApiErrors } from "@/lib/api/respond";

// Como los handlers reales: el error de lectura se traga y se sigue.
const handler = withApiErrors(async (req: Request) => Response.json({ size: (await req.text().catch(() => "")).length }));

function chunked(bytes: number): Request {
  const chunk = new Uint8Array(64 * 1024).fill(97);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= bytes) return c.close();
      const n = Math.min(chunk.length, bytes - sent);
      sent += n;
      c.enqueue(chunk.subarray(0, n));
    },
  });
  return new Request("https://app.test/api/v1/contacts", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("tope de cuerpo de /api/v1", () => {
  it("413 si Content-Length pasa de 1 MB", async () => {
    const res = await handler(new Request("https://app.test/api/v1/contacts", { method: "POST", body: "x", headers: { "content-length": String(1024 * 1024 + 1) } }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
  });

  it("deja pasar 1 MB justo", async () => {
    const res = await handler(new Request("https://app.test/api/v1/contacts", { method: "POST", body: "x".repeat(1024 * 1024) }));
    expect(res.status).toBe(200);
  });

  it("mide también un cuerpo sin Content-Length (chunked)", async () => {
    const big = await handler(chunked(2 * 1024 * 1024));
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe("payload_too_large");
    const ok = await handler(chunked(10_000));
    expect(ok.status).toBe(200);
    expect((await ok.json()).size).toBe(10_000);
  });
});
