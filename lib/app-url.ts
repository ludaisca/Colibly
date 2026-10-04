// APP_URL es el origen del producto: correos de acceso, Stripe y APIs.
// SITE_URL es el origen de la web pública. Ambos se leen en runtime.
export function appUrl(path: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:15100").replace(/\/$/, "");
  return base + path;
}

export function siteUrl(path: string): string {
  const base = (process.env.SITE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:15100").replace(/\/$/, "");
  return base + path;
}
