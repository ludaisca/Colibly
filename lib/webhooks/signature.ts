import { createHmac, randomBytes } from "node:crypto";

// Esquema de firma de los webhooks salientes, igual al de Stripe:
//   X-Sunday-Signature: t=<unix segundos>,v1=<hex(hmac_sha256(secret, `${t}.${body}`))>
// El timestamp va dentro de lo firmado para que el receptor pueda rechazar
// reenvíos viejos (replay) comparándolo con su reloj.
export const SIGNATURE_HEADER = "X-Sunday-Signature";

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhookBody(secret: string, body: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}
