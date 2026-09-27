import { httpTimeout } from "@/lib/http-timeouts";

// Captcha del registro público (Cloudflare Turnstile). Opcional: con
// TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY definidas se exige en el registro;
// sin ellas el registro funciona como antes (solo con los límites por IP).
// Leídas en runtime, como la medición del sitio (lib/analytics/config.ts).

const KEY_FORMAT = /^[0-9A-Za-z_-]{10,100}$/;
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function keys(): { site: string; secret: string } | null {
  const site = process.env.TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!site || !secret) return null;
  if (!KEY_FORMAT.test(site) || !KEY_FORMAT.test(secret)) {
    console.warn("[turnstile] TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY con formato inválido; el captcha queda apagado");
    return null;
  }
  return { site, secret };
}

// La clave pública para el widget, o null si el captcha está apagado.
export function turnstileSiteKey(): string | null {
  return keys()?.site ?? null;
}

// true = puede seguir. Con el captcha apagado siempre true. Si Cloudflare no
// responde (caída, timeout) también deja pasar y lo registra: los límites por
// IP siguen activos y un registro caído cuesta más que unos minutos sin captcha.
// Un token ausente, vencido o rechazado es false.
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const k = keys();
  if (!k) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret: k.secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: httpTimeout() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) console.warn("[turnstile] Token rechazado:", data["error-codes"]?.join(", "));
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] No se pudo verificar con Cloudflare; se deja pasar:", err);
    return true;
  }
}
