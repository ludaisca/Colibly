import { createHmac, timingSafeEqual } from "crypto";

// Roadmap P3-f — token de sesión del widget de chat en vivo. A diferencia de
// Telegram/Messenger (el visitante ES la plataforma, autenticada por Meta/
// Telegram), aquí el "proveedor" somos nosotros: un visitante anónimo del
// sitio del cliente genera su propio visitorId (UUID en localStorage, ver
// widget.js) y este token es lo único que prueba "soy ese visitorId de esta
// cuenta" en las rutas públicas subsecuentes — sin sesión de NextAuth, sin
// contraseña. Formato deliberadamente simple (HMAC-SHA256 sobre un payload
// base64url, sin librería de JWT nueva): `<payload-b64url>.<hex-hmac>`.
// Firmado con ENCRYPTION_KEY (ya requerida, ya secreta) — no es la misma
// operación que AES-GCM de lib/crypto.ts, solo reutiliza el mismo secreto
// como clave HMAC.

interface WebchatTokenPayload {
  visitorId: string;
  channelAccountId: string;
  iat: number; // epoch segundos
  exp: number; // epoch segundos
}

const SESSION_DURATION_SECONDS = 24 * 60 * 60; // 24h — el widget renueva pidiendo una sesión nueva cuando expira

function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY no está configurada");
  return key;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

export function createWebchatToken(visitorId: string, channelAccountId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: WebchatTokenPayload = { visitorId, channelAccountId, iat: now, exp: now + SESSION_DURATION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

// Verifica firma + expiración + que el token corresponde EXACTAMENTE a la
// cuenta de la URL (`[accountId]`) — un token válido de la cuenta A nunca
// debe servir en la cuenta B, aunque ambas tengan el mismo secreto de firma.
export function verifyWebchatToken(token: string, channelAccountId: string): { visitorId: string } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: WebchatTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.channelAccountId !== channelAccountId) return null;
  return { visitorId: payload.visitorId };
}
