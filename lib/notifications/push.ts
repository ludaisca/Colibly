import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { inboxQueue } from "@/lib/queue";
import { getPlatformSettings } from "@/lib/platform-settings";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

// Notificaciones push del navegador (benchmark #8). Acompañan a algunas
// Notification de la campana —mensaje en un chat asignado, chat asignado,
// llamada entrante—, nunca la reemplazan. Se mandan desde la cola `inbox`
// (job "push") para no meter una llamada HTTP externa en el ingest.
//
// Llaves VAPID en PlatformSettings (se generan en /plataforma); sin llaves no
// se encola nada. Una suscripción que el servicio push da por muerta (404/410)
// se borra.

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta interna a abrir al hacer clic (siempre relativa a la app). */
  link: string;
  /** Mismo tag = el navegador reemplaza la notificación anterior (un aviso por chat). */
  tag?: string;
}

export interface PushJob extends PushPayload {
  userId: string;
}

/** Solo rutas internas: evita que un link armado con datos externos saque al usuario de la app. */
export function safePushLink(link: string): string {
  return link.startsWith("/") && !link.startsWith("//") ? link : "/";
}

/**
 * Encola un push si la plataforma tiene llaves y el usuario al menos una
 * suscripción. Nunca lanza: la notificación de la campana ya se guardó.
 */
export async function queuePush(userId: string, payload: PushPayload): Promise<void> {
  try {
    const settings = await getPlatformSettings();
    if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return;
    const hasSubscription = await prisma.pushSubscription.findFirst({ where: { userId }, select: { id: true } });
    if (!hasSubscription) return;
    const job: PushJob = {
      userId,
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 240),
      link: safePushLink(payload.link),
      tag: payload.tag,
    };
    await inboxQueue.add("push", job);
  } catch (error) {
    console.error("[push] no se pudo encolar", error);
  }
}

export async function processPushJob(job: PushJob): Promise<{ sent: number; removed: number }> {
  const settings = await getPlatformSettings();
  if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return { sent: 0, removed: 0 };
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: job.userId } });
  const payload = JSON.stringify({ title: job.title, body: job.body, link: job.link, tag: job.tag });
  let sent = 0;
  let removed = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          vapidDetails: { subject: `mailto:${BRAND_CONTACT_EMAIL}`, publicKey: settings.vapidPublicKey, privateKey: settings.vapidPrivateKey },
          TTL: 300,
          urgency: "high",
          timeout: 10_000,
        }
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        removed++;
      } else {
        console.error(`[push] envío fallido (${status ?? "sin status"}) para ${job.userId}`);
      }
    }
  }
  return { sent, removed };
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
