import { createHash } from "node:crypto";
import { httpTimeout } from "@/lib/http-timeouts";
import { getPlatformSettings } from "@/lib/platform-settings";

// Conversions API de Meta para el registro de NUESTROS clientes (medición de
// anuncios de Colibly). No confundir con lib/meta/conversions.ts, que manda
// eventos de los leads de cada cliente a SU cuenta de anuncios.
// Se envía solo si el visitante aceptó cookies (el navegador manda el eventId
// únicamente en ese caso) y si existen META_PIXEL_ID y META_CAPI_ACCESS_TOKEN.

const GRAPH_VERSION = "v21.0";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function readCookie(header: string | null, name: string): string | undefined {
  return header?.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="))?.slice(name.length + 1);
}

export async function sendMetaSignupEvent(req: Request, input: { eventId: string; email: string; sourceUrl: string }): Promise<void> {
  const { metaPixelId: pixelId, metaCapiAccessToken: token } = await getPlatformSettings();
  if (!pixelId || !token || !/^\d{6,20}$/.test(pixelId)) return;

  const cookies = req.headers.get("cookie");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.sourceUrl,
        user_data: {
          em: [sha256(input.email)],
          client_ip_address: ip,
          client_user_agent: req.headers.get("user-agent") ?? undefined,
          fbp: readCookie(cookies, "_fbp"),
          fbc: readCookie(cookies, "_fbc"),
        },
      },
    ],
  };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: httpTimeout(),
    });
    if (!res.ok) console.warn("[analytics] Conversions API respondió", res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.warn("[analytics] Conversions API falló", error);
  }
}
