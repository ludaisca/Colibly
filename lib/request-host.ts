// Detrás de un proxy, req.nextUrl.hostname puede ser el nombre interno del
// contenedor. El host público llega en X-Forwarded-Host o Host.
export function requestHost(headers: Headers, fallback?: string): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const value = forwarded || headers.get("host") || fallback;
  if (!value) return null;
  try { return new URL(`http://${value}`).hostname.toLowerCase(); } catch { return null; }
}
