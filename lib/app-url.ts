// URL pública de la app para enlaces absolutos (correos, Stripe, metadatos y
// sitemap). APP_URL se lee en tiempo de ejecución: una NEXT_PUBLIC_* queda fija
// en el build de Next y en producción no se pasa al contenedor.
export function appUrl(path: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:15100").replace(/\/$/, "");
  return base + path;
}
