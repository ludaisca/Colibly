import { UnrecoverableError, type Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { WEBHOOK_DELIVERY_ATTEMPTS } from "@/lib/queue";
import { SIGNATURE_HEADER, signWebhookBody } from "./signature";

// Tras tantas entregas fallidas SEGUIDAS (cada una ya agotó sus reintentos) el
// endpoint se desactiva solo y se avisa a su dueño — un receptor muerto no
// debe acumular miles de jobs ni esconder que la integración está rota.
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 20;

export interface WebhookDeliveryJob {
  deliveryId: string;
}

export async function processWebhookDelivery(job: Job<WebhookDeliveryJob>): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status === "SENT") return;

  const { endpoint } = delivery;
  if (!endpoint.active || endpoint.disabledAt) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: "El endpoint está desactivado" },
    });
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const attempt = job.attemptsMade + 1;
  const isLastAttempt = attempt >= (job.opts.attempts ?? WEBHOOK_DELIVERY_ATTEMPTS);

  let failure: { message: string; responseCode: number | null; permanent: boolean } | null = null;
  try {
    const res = await safeFetch(endpoint.url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: signWebhookBody(decrypt(endpoint.secret), body),
        "X-Sunflow-Event": delivery.eventType,
        "X-Sunflow-Delivery": delivery.id,
      },
      maxResponseBytes: 4096,
    });
    if (res.status >= 200 && res.status < 300) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", attempts: attempt, responseCode: res.status, error: null, deliveredAt: new Date() },
        }),
        prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { consecutiveFailures: 0, lastDeliveryAt: new Date() },
        }),
      ]);
      return;
    }
    failure = { message: `El destino respondió ${res.status}: ${res.body.slice(0, 300)}`, responseCode: res.status, permanent: false };
  } catch (err) {
    // URL bloqueada o inválida: reintentar no lo arregla.
    const permanent = err instanceof SafeFetchError && (err.code === "BLOCKED_ADDRESS" || err.code === "INVALID_URL");
    failure = { message: err instanceof Error ? err.message : String(err), responseCode: null, permanent };
  }

  const final = isLastAttempt || failure.permanent;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts: attempt,
      responseCode: failure.responseCode,
      error: failure.message.slice(0, 1000),
      status: final ? "FAILED" : "PENDING",
    },
  });

  if (final) {
    await registerEndpointFailure(endpoint.id, endpoint.userId, endpoint.name);
    if (failure.permanent) throw new UnrecoverableError(failure.message);
    return; // último intento: ya quedó FAILED, no se relanza para no duplicar el registro
  }
  throw new Error(failure.message); // BullMQ reintenta con backoff
}

async function registerEndpointFailure(endpointId: string, ownerId: string, name: string): Promise<void> {
  const updated = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: { consecutiveFailures: { increment: 1 } },
    select: { consecutiveFailures: true, disabledAt: true },
  });
  if (updated.consecutiveFailures < WEBHOOK_MAX_CONSECUTIVE_FAILURES || updated.disabledAt) return;

  await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { active: false, disabledAt: new Date() } });
  await prisma.notification.create({
    data: {
      userId: ownerId,
      type: "INTEGRATION_ERROR",
      title: `Webhook "${name}" desactivado`,
      body: `Falló ${WEBHOOK_MAX_CONSECUTIVE_FAILURES} entregas seguidas. Revisa el destino y reactívalo.`,
      link: "/configuracion/api?tab=webhooks",
    },
  });
}
