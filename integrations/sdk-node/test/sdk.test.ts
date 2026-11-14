import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Colibly, ColiblyError, verifyWebhookSignature } from "../src/index.ts";

test("verifica la firma de un webhook y rechaza una vieja", () => {
  const body = '{"type":"message.received"}';
  const t = 1_700_000_000;
  const sig = createHmac("sha256", "whsec_x").update(`${t}.${body}`).digest("hex");
  assert.equal(verifyWebhookSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, "whsec_x", { nowSeconds: t + 10 }), true);
  assert.equal(verifyWebhookSignature(body, `t=${t},v1=${sig}`, "whsec_x", { nowSeconds: t + 1000 }), false);
  assert.equal(verifyWebhookSignature(body, `t=${t},v1=${sig}`, "otro", { nowSeconds: t }), false);
});

test("manda la key, Idempotency-Key en POST y lanza ColiblyError con metaCode", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ error: { code: "upstream_error", message: "Meta: fuera de la ventana", meta: { code: 131047 }, requestId: "req_1" } }), { status: 502 });
  }) as unknown as typeof fetch;
  const client = new Colibly({ apiKey: "sk_test_x", baseUrl: "https://x.test", fetch: fake, maxRetries: 0 });
  await assert.rejects(client.messages.send({ conversationId: "c1", type: "text", text: "Hola" }), (err: unknown) => {
    assert.ok(err instanceof ColiblyError);
    assert.equal(err.metaCode, 131047);
    assert.equal(err.requestId, "req_1");
    return true;
  });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk_test_x");
  assert.ok(headers["Idempotency-Key"]);
  assert.equal(calls[0].url, "https://x.test/api/v1/messages");
});

test("reintenta un 429 respetando Retry-After", async () => {
  let n = 0;
  const fake = (async () => (++n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "0" } }) : new Response('{"ok":true}', { status: 200 }))) as unknown as typeof fetch;
  const client = new Colibly({ apiKey: "sk_live_x", fetch: fake });
  assert.deepEqual(await client.me(), { ok: true });
  assert.equal(n, 2);
});
