import type { ChannelAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";

// Roadmap P3-f — shape de ChannelAccount.credentials para WEBCHAT. A
// diferencia de Telegram/Messenger (credenciales de una plataforma externa),
// aquí no hay secreto de proveedor que guardar — lo único que se persiste es
// la lista de dominios autorizados a embeber el widget, cifrada con el mismo
// mecanismo (lib/crypto.ts) por consistencia con el resto del modelo, no
// porque sea sensible.
export interface WebchatCredentials {
  allowedOrigins: string[];
}

// Solo necesita `credentials` — Pick en vez del modelo completo permite
// pasarle selects parciales (ver GET /api/webchat/accounts/[id]) sin un
// cast forzado.
export function getWebchatCredentials(account: Pick<ChannelAccount, "credentials">): WebchatCredentials {
  return JSON.parse(decrypt(account.credentials)) as WebchatCredentials;
}

// Compara el header Origin del navegador contra la lista configurada — exact
// match del origin completo (protocolo+host+puerto), sin wildcards ni
// matching de subdominio: un CRM sin backend propio de gestión de dominios
// no debería inventar reglas de patrón que luego alguien tenga que auditar.
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

// Headers CORS reales (no solo cosméticos) para las 3 rutas públicas del
// widget — sin esto, cualquier fetch cross-origin del navegador del
// visitante fallaría silenciosamente aunque el backend respondiera 200.
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// El token de sesión viaja en `Authorization: Bearer` — en la query string
// quedaba registrado en logs de acceso y proxies. Se acepta todavía en el body
// o la query para copias del widget ya cargadas en pestañas abiertas.
export function readWebchatToken(req: Request, fallback: string | null): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  return fallback;
}
