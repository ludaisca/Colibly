import * as nodeCrypto from "node:crypto";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookBody } from "@/lib/webhooks/signature";
import { NODE_VERIFY, PHP_VERIFY, PYTHON_VERIFY } from "@/app/(marketing)/docs/api/_snippets";

// La receta publicada (HMAC-SHA256 de "t.cuerpo", hex, formato t=…,v1=…) debe
// ser la misma que usa el servidor al firmar.
describe("snippets de verificación de firma", () => {
  it("la firma del servidor sigue la receta documentada", () => {
    const body = '{"id":"e1","type":"webhook.test"}';
    const header = signWebhookBody("whsec_test", body, 1792435167);
    const match = header.match(/^t=(\d+),v1=([0-9a-f]{64})$/);
    expect(match).not.toBeNull();
    expect(match![2]).toBe(createHmac("sha256", "whsec_test").update(`1792435167.${body}`).digest("hex"));
  });

  it("los snippets usan el mismo formato y comparación en tiempo constante", () => {
    expect(NODE_VERIFY).toContain("timingSafeEqual");
    expect(NODE_VERIFY).toContain("X-Colibly-Signature");
    expect(PHP_VERIFY).toContain("hash_equals");
    expect(PHP_VERIFY).toContain("hash_hmac('sha256', $t . '.' . $body, $secret)");
    expect(PYTHON_VERIFY).toContain("hmac.compare_digest");
    // Aceptan varias v1 (rotación con periodo de gracia), no solo una.
    expect(NODE_VERIFY).toContain("signatures.some(");
    expect(PHP_VERIFY).toContain("foreach ($signatures as $v1)");
    expect(PYTHON_VERIFY).toContain("any(hmac.compare_digest(expected, v1) for v1 in signatures)");
    for (const snippet of [NODE_VERIFY, PHP_VERIFY]) expect(snippet).not.toMatch(/\^t=\(\\d\+\),v1=/);
    expect(PYTHON_VERIFY).toContain('f"{t}.".encode() + body');
  });
});

// La receta de Node publicada, ejecutada tal cual (Express simulado): acepta
// una firma del servidor, también con dos v1 tras rotar con gracia, y
// rechaza un secreto equivocado o una entrega vieja.
describe("receta de Node, ejecutada", () => {
  type Handler = (req: { get: (h: string) => string | undefined; body: Buffer }, res: { sendStatus: (c: number) => void }) => void;
  function load(secret: string): Handler {
    let handler: Handler | null = null;
    const fakeExpress = Object.assign(() => ({ post: (_p: string, _mw: unknown, h: Handler) => (handler = h) }), { raw: () => null });
    const code = NODE_VERIFY.replace(/^import .*$/gm, "");
    new Function("crypto", "express", "process", "procesar", code)(nodeCrypto, fakeExpress, { env: { COLIBLY_WEBHOOK_SECRET: secret } }, () => {});
    return handler!;
  }
  function call(h: Handler, header: string, body: string): number {
    let status = 0;
    h({ get: (n) => (n === "X-Colibly-Signature" ? header : undefined), body: Buffer.from(body) }, { sendStatus: (c) => (status = c) });
    return status;
  }
  const body = '{"id":"e1","type":"webhook.test"}';
  const now = () => Math.floor(Date.now() / 1000);

  it("acepta la firma de un secreto", () => expect(call(load("whsec_a"), signWebhookBody("whsec_a", body, now()), body)).toBe(200));
  it("con dos v1 acepta el secreto nuevo y el anterior", () => {
    const header = signWebhookBody(["whsec_nuevo", "whsec_viejo"], body, now());
    expect(call(load("whsec_nuevo"), header, body)).toBe(200);
    expect(call(load("whsec_viejo"), header, body)).toBe(200);
  });
  it("rechaza otro secreto, un cuerpo alterado y una entrega vieja", () => {
    expect(call(load("whsec_otro"), signWebhookBody("whsec_a", body, now()), body)).toBe(401);
    expect(call(load("whsec_a"), signWebhookBody("whsec_a", body, now()), body + " ")).toBe(401);
    expect(call(load("whsec_a"), signWebhookBody("whsec_a", body, now() - 600), body)).toBe(400);
    expect(call(load("whsec_a"), "basura", body)).toBe(400);
  });
});
