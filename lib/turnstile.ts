import { httpTimeout } from "@/lib/http-timeouts";
import { getPlatformSettings } from "@/lib/platform-settings";
import { TURNSTILE_ACTION } from "@/lib/turnstile-shared";

// Captcha del registro público (Cloudflare Turnstile). Opcional: con el site
// key y el secret key configurados en /plataforma se exige en el registro; sin
// ellos el registro funciona como antes (solo con los límites por IP).

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// La acción estable vive en turnstile-shared.ts porque el widget la envía al
// renderizar y siteverify la devuelve tal cual: compararla impide reutilizar en
// el registro un token emitido para otra pantalla del mismo sitekey.
export { TURNSTILE_ACTION };

async function keys(): Promise<{ site: string; secret: string } | null> {
  const { turnstileSiteKey, turnstileSecretKey } = await getPlatformSettings();
  if (!turnstileSiteKey || !turnstileSecretKey) return null;
  return { site: turnstileSiteKey, secret: turnstileSecretKey };
}

// La clave pública para el widget, o null si el captcha está apagado.
export async function turnstileSiteKey(): Promise<string | null> {
  return (await keys())?.site ?? null;
}

// Hostnames donde el widget puede resolver. En producción solo el de APP_URL
// (el backend valida exactamente el hostname que devuelve siteverify, así que
// localhost nunca entra ahí). En desarrollo se suman localhost, 127.0.0.1 y,
// más abajo, el nombre corto de Tailscale que recomienda el README.
export function turnstileHostnames(appUrlValue: string | null | undefined, dev: boolean): Set<string> {
  const hosts = new Set<string>();
  if (appUrlValue) {
    try {
      hosts.add(new URL(appUrlValue).hostname.toLowerCase());
    } catch {
      // APP_URL inválida: en producción el set queda vacío y se rechaza.
    }
  }
  if (dev) {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return hosts;
}

// Decisión pura sobre la respuesta de siteverify (testeada en
// __tests__/turnstile.test.ts). `hostnames` vacío solo se acepta en desarrollo.
export function turnstileAccepted(
  result: { success?: boolean; action?: string; hostname?: string },
  opts: { hostnames: ReadonlySet<string>; dev: boolean }
): boolean {
  if (result.success !== true) return false;
  if (result.action !== TURNSTILE_ACTION) return false;
  if (typeof result.hostname !== "string" || !result.hostname) return false;
  const host = result.hostname.toLowerCase();
  if (opts.hostnames.has(host)) return true;
  // DEV: se entra como "ludaisca" (MagicDNS) además de localhost/APP_URL.
  return opts.dev && !host.includes(".");
}

// true = puede seguir. Con el captcha apagado siempre true. Si Cloudflare no
// responde (caída, timeout) también deja pasar y lo registra: los límites por
// IP siguen activos y un registro caído cuesta más que unos minutos sin captcha.
// Un token ausente, vencido o rechazado, o una acción/hostname que no
// coinciden, es false.
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const k = await keys();
  if (!k) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const dev = process.env.NODE_ENV !== "production";
  const hostnames = turnstileHostnames(process.env.APP_URL, dev);
  if (!dev && hostnames.size === 0) {
    // Sin APP_URL no hay forma de validar el hostname: falla cerrado.
    console.error("[turnstile] APP_URL no está definida; no se puede validar el hostname del captcha");
    return false;
  }

  const body = new URLSearchParams({ secret: k.secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: httpTimeout() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };
    if (!turnstileAccepted(data, { hostnames, dev })) {
      console.warn("[turnstile] Token rechazado:", {
        codes: data["error-codes"]?.join(", ") ?? null,
        action: data.action ?? null,
        hostname: data.hostname ?? null,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[turnstile] No se pudo verificar con Cloudflare; se deja pasar:", err);
    return true;
  }
}
