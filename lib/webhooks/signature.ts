import { createHmac, randomBytes } from "node:crypto";

// Esquema de firma de los webhooks salientes, igual al de Stripe:
//   X-Colibly-Signature: t=<unix segundos>,v1=<hex(hmac_sha256(secret, `${t}.${body}`))>
// El timestamp va dentro de lo firmado para que el receptor pueda rechazar
// reenvíos viejos (replay) comparándolo con su reloj.
// Durante el periodo de gracia de una rotación el header lleva una v1 por
// secreto, la del nuevo primero: `t=…,v1=<nuevo>,v1=<anterior>`. El receptor
// acepta la entrega si CUALQUIERA de las v1 coincide con su secreto.
export const SIGNATURE_HEADER = "X-Colibly-Signature";

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhookBody(secret: string | string[], body: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const secrets = Array.isArray(secret) ? secret : [secret];
  const sigs = secrets.map((s) => `v1=${createHmac("sha256", s).update(`${timestamp}.${body}`).digest("hex")}`);
  return `t=${timestamp},${sigs.join(",")}`;
}

/** Secretos con los que se firma hoy: el vigente y, en su periodo de gracia, el anterior. */
export function signingSecrets(e: { secret: string; previousSecret: string | null; previousSecretExpiresAt: Date | null }, decryptFn: (v: string) => string, now = new Date()): string[] {
  const out = [decryptFn(e.secret)];
  if (e.previousSecret && e.previousSecretExpiresAt && e.previousSecretExpiresAt > now) out.push(decryptFn(e.previousSecret));
  return out;
}
