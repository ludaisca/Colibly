import { httpTimeout } from "@/lib/http-timeouts";

// Mismo espíritu que lib/whatsapp.ts:validateToken() — una llamada liviana a
// la Graph API al crear/actualizar la cuenta, para atrapar un pageId o token
// mal copiado de inmediato en vez de descubrirlo cuando llegue el primer
// leadgen real.
const GRAPH_API = "https://graph.facebook.com/v21.0";

interface PageInfo {
  id: string;
  name?: string;
}

export async function validatePageToken(pageId: string, pageAccessToken: string): Promise<PageInfo> {
  const url = `${GRAPH_API}/${pageId}?fields=id,name`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${pageAccessToken}` },
    signal: httpTimeout(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Token validation failed (HTTP ${res.status})`);
  }

  return res.json() as Promise<PageInfo>;
}
