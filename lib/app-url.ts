// APP_URL es el origen del producto: correos de acceso, Stripe y APIs.
// SITE_URL es el origen de la web pública. Ambos se leen en runtime.
export function appUrl(path: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:1100").replace(/\/$/, "");
  return base + path;
}

export function siteUrl(path: string): string {
  const base = (process.env.SITE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:1100").replace(/\/$/, "");
  return base + path;
}

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

/** ¿La petición llega al host de la app, con sitio y app en dominios distintos? (mismo criterio que proxy.ts) */
export function isAppHost(host: string | null): boolean {
  const site = hostOf(process.env.SITE_URL);
  const app = hostOf(process.env.APP_URL);
  return !!site && !!app && site !== app && host === app;
}

/**
 * Enlace a una página del sitio público. En el host de la app (el layout del
 * sitio también envuelve /docs/api ahí) va absoluto a SITE_URL; en el propio
 * sitio queda relativo, para navegar con <Link> y su prefetch.
 */
export function siteHref(path: string, onAppHost: boolean): string {
  return onAppHost ? siteUrl(path) : path;
}

/** ¿La petición llega al host del sitio público, con sitio y app en dominios distintos? */
export function isSiteHost(host: string | null): boolean {
  const site = hostOf(process.env.SITE_URL);
  const app = hostOf(process.env.APP_URL);
  return !!site && !!app && site !== app && (host === site || host === `www.${site}`);
}
