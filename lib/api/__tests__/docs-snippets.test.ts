import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookBody } from "@/lib/webhooks/signature";
import { NODE_VERIFY, PHP_VERIFY } from "@/app/(marketing)/docs/api/_snippets";

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
  });
});
