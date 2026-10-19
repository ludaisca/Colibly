// IP del cliente para límites anti-abuso (fuerza bruta de login, API keys
// inválidas, registro...). Regla de confianza — ver docs/AUDITORIA_API_WEBHOOKS_2026-10-19.md:
//
// En producción la app corre detrás de Traefik (Coolify). Traefik, sin
// `forwardedHeaders.trustedIPs`, BORRA los X-Forwarded-* y X-Real-Ip que
// manda el cliente, pone X-Real-Ip = IP del socket y agrega esa misma IP AL
// FINAL de X-Forwarded-For. Por eso:
//   1. TRUSTED_CLIENT_IP_HEADER (opcional): si algún día se pone un CDN delante
//      (p. ej. Cloudflare → "cf-connecting-ip"), se nombra aquí su header. Solo
//      sirve si Traefik/el firewall aceptan tráfico únicamente del CDN.
//   2. X-Real-Ip: lo escribe nuestro proxy, no el cliente.
//   3. El ÚLTIMO elemento de X-Forwarded-For (el que agregó nuestro proxy).
//      NUNCA el primero: ese lo controla quien hace la petición, y rotarlo
//      saltaría cualquier límite por IP.
//   4. "unknown" (todos comparten un mismo cubo: más estricto, no más laxo).
export function clientIp(source: Request | Headers): string {
  const headers = source instanceof Headers ? source : source.headers;
  const custom = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (custom) {
    const value = clean(headers.get(custom));
    if (value) return value;
  }
  const real = clean(headers.get("x-real-ip"));
  if (real) return real;
  const chain = headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = clean(chain[chain.length - 1]);
  return last ?? "unknown";
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  // Una IP (v4/v6, con puerto opcional) cabe en 64 caracteres; lo demás es basura.
  if (!v || v.length > 64 || !/^[0-9a-fA-F:.[\]]+$/.test(v)) return null;
  return v;
}
