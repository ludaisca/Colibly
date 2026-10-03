import { createHmac, timingSafeEqual } from "crypto";

// `signed_request` de Meta (callbacks de desautorización y de eliminación de
// datos): "<firma>.<payload>", ambos en base64url. La firma es el HMAC-SHA256 del
// payload (tal como viene, en base64url) con el App Secret.
export interface SignedRequestPayload {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
}

export function parseSignedRequest(signedRequest: string | null | undefined, appSecret: string | null | undefined): SignedRequestPayload | null {
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;
  if (!encodedSig || !encodedPayload) return null;

  try {
    const received = Buffer.from(encodedSig, "base64url");
    const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SignedRequestPayload;
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return payload;
  } catch {
    return null;
  }
}

// Solo para pruebas y herramientas de desarrollo: genera un signed_request válido.
export function buildSignedRequest(payload: SignedRequestPayload, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...payload })).toString("base64url");
  const sig = createHmac("sha256", appSecret).update(encodedPayload).digest().toString("base64url");
  return `${sig}.${encodedPayload}`;
}
