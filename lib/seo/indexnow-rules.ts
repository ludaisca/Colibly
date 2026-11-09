// IndexNow (https://www.indexnow.org): avisa a Bing, Yandex y demás buscadores
// de las URLs nuevas o cambiadas. Reglas puras; el envío está en indexnow.ts.

/**
 * Clave pública de IndexNow (8–128 caracteres hexadecimales). No es un secreto:
 * el protocolo exige publicarla en /<clave>.txt para demostrar que el sitio es
 * nuestro (public/<clave>.txt; una prueba vigila que coincidan).
 */
export const INDEXNOW_KEY = "250b37638e9e2325c47d4889b067515f";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Máximo de URLs por petición según el protocolo. */
export const INDEXNOW_BATCH = 10_000;

/** URLs nuevas o cuyo contenido cambió respecto a lo último que se avisó. */
export function changedUrls(current: Record<string, string>, stored: Record<string, string>): string[] {
  return Object.keys(current).filter((url) => stored[url] !== current[url]);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function indexNowPayload(host: string, urls: string[]) {
  return { host, key: INDEXNOW_KEY, keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

/** Solo se avisa desde producción y con un dominio público: nunca desde dev ni localhost. */
export function shouldSubmit(env: { nodeEnv?: string; siteUrl?: string }): { host: string } | null {
  if (env.nodeEnv !== "production" || !env.siteUrl) return null;
  let host: string;
  try {
    host = new URL(env.siteUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".test") || /^[\d.]+$/.test(host) || !host.includes(".")) return null;
  return { host };
}
