// Versión única de la Graph API para TODO el código (envíos, plantillas,
// Messenger/Instagram, Conversions API, Lead Ads, Embedded Signup…). Meta retira
// cada versión ~2 años después de publicarla: subirla es cambiar esta línea y
// probar los envíos (docs/META_JSON_CUENTAS_WA_2026-11-04.md §4).
export const GRAPH_API_VERSION = "v25.0";
// Base fija a graph.facebook.com para los clientes que no usan graphUrl(): no
// siguen META_GRAPH_ORIGIN (el Meta simulado de dev solo cubre el alta).
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
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
