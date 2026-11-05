import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/email/mailer";

// Baja de los consejos de la prueba: el enlace lleva el id de la organización
// y una firma HMAC con AUTH_SECRET (sin estado ni vencimiento: darse de baja
// tiene que funcionar siempre). Solo apaga los consejos; los avisos de cuenta
// y de facturación siguen llegando.

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no está configurado");
  return s;
}

export function nudgeUnsubscribeSignature(organizationId: string, key = secret()): string {
  return createHmac("sha256", key).update(`activation-nudges:${organizationId}`).digest("base64url");
}

export function verifyNudgeUnsubscribe(organizationId: string, signature: string, key = secret()): boolean {
  const expected = Buffer.from(nudgeUnsubscribeSignature(organizationId, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function nudgeUnsubscribeUrl(organizationId: string): string {
  const params = new URLSearchParams({ o: organizationId, s: nudgeUnsubscribeSignature(organizationId) });
  return appUrl(`/api/correos/consejos/baja?${params}`);
}
