import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { GRAPH_API_BASE } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";
import { noticesFrom, type MetaHealthEntity } from "@/lib/platform/whatsapp-health-rules";

// Salud del número leída de Graph (no del webhook): calificación de calidad,
// límite de envío, estado del nombre y `health_status` (si puede enviar y por
// qué no). El webhook `phone_number_quality_update` solo trae el SUCESO
// (FLAGGED, UPGRADE…), así que la ficha de la cuenta mostraba un evento como
// si fuera la calidad (docs/META_JSON_CUENTAS_WA_2026-11-04.md §5.2-3).
//
// Se llama al abrir la ficha (con caché) y tras cada webhook de calidad.
// Nunca lanza: si Meta no responde, queda lo último guardado.

export const PHONE_HEALTH_TTL_MS = 10 * 60_000;
const FIELDS = "quality_rating,messaging_limit_tier,name_status,health_status";
const TIMEOUT_MS = 4_000;

interface MetaPhoneHealth {
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  health_status?: { can_send_message?: string; entities?: MetaHealthEntity[] };
  error?: { message?: string };
}

export async function refreshPhoneHealth(accountId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  try {
    const account = await prisma.wAAccount.findUnique({
      where: { id: accountId },
      select: { phoneNumberId: true, accessToken: true, channel: true, healthCheckedAt: true },
    });
    if (!account?.phoneNumberId || !account.accessToken || account.channel !== "META_CLOUD") return false;
    if (!opts.force && account.healthCheckedAt && Date.now() - account.healthCheckedAt.getTime() < PHONE_HEALTH_TTL_MS) return false;

    const res = await fetch(`${GRAPH_API_BASE}/${account.phoneNumberId}?fields=${FIELDS}`, {
      headers: { Authorization: `Bearer ${decrypt(account.accessToken)}` },
      signal: httpTimeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as MetaPhoneHealth | null;
    if (!res.ok || !body) {
      console.warn(`[phone-health] Meta respondió ${res.status} para la cuenta ${accountId}: ${body?.error?.message ?? "sin detalle"}`);
      // Se marca igual para no reintentar en cada vista mientras Meta falla.
      await prisma.wAAccount.update({ where: { id: accountId }, data: { healthCheckedAt: new Date() } });
      return false;
    }
    const now = new Date();
    await prisma.wAAccount.update({
      where: { id: accountId },
      data: {
        qualityRating: body.quality_rating ?? null,
        messagingTier: body.messaging_limit_tier ?? null,
        nameStatus: body.name_status ?? null,
        canSendMessage: body.health_status?.can_send_message ?? null,
        healthNotices: noticesFrom(body.health_status?.entities),
        healthCheckedAt: now,
        qualityUpdatedAt: now,
      },
    });
    return true;
  } catch (err) {
    console.warn(`[phone-health] No se pudo leer la salud de la cuenta ${accountId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
