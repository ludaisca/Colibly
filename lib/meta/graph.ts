// Versión y construcción de URLs de la Graph API para el código NUEVO de la
// app de plataforma (Embedded Signup, coexistencia). Los clientes anteriores
// (lib/whatsapp.ts, lib/meta-messaging.ts, lib/meta/conversions.ts, …) siguen
// fijados a v21.0 a propósito: moverlos de versión es un cambio aparte que hay
// que probar uno por uno, no un efecto secundario de esta integración.
export const GRAPH_API_VERSION = "v25.0";
// Solo en desarrollo se puede apuntar a un Meta simulado (META_GRAPH_ORIGIN) para
// probar el alta y la sincronización de punta a punta sin tocar cuentas reales.
// En producción la variable se ignora siempre.
export const GRAPH_API_ORIGIN =
  process.env.NODE_ENV !== "production" && process.env.META_GRAPH_ORIGIN ? process.env.META_GRAPH_ORIGIN.replace(/\/$/, "") : "https://graph.facebook.com";

export function graphUrl(path: string, params?: Record<string, string | undefined>): string {
  const clean = path.replace(/^\/+/, "");
  const url = new URL(`${GRAPH_API_ORIGIN}/${GRAPH_API_VERSION}/${clean}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
