import { httpTimeout } from "@/lib/http-timeouts";
import { getPlatformSettings } from "@/lib/platform-settings";

// Captcha del registro público (Cloudflare Turnstile). Opcional: con el site
// key y el secret key configurados en /plataforma se exige en el registro; sin
// ellos el registro funciona como antes (solo con los límites por IP).

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function keys(): Promise<{ site: string; secret: string } | null> {
  const { turnstileSiteKey, turnstileSecretKey } = await getPlatformSettings();
  if (!turnstileSiteKey || !turnstileSecretKey) return null;
  return { site: turnstileSiteKey, secret: turnstileSecretKey };
}

// La clave pública para el widget, o null si el captcha está apagado.
export async function turnstileSiteKey(): Promise<string | null> {
  return (await keys())?.site ?? null;
}

// true = puede seguir. Con el captcha apagado siempre true. Si Cloudflare no
// responde (caída, timeout) también deja pasar y lo registra: los límites por
// IP siguen activos y un registro caído cuesta más que unos minutos sin captcha.
// Un token ausente, vencido o rechazado es false.
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const k = await keys();
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
