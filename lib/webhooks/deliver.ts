import { DelayedError, UnrecoverableError, type Job } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { WEBHOOK_DELIVERY_ATTEMPTS } from "@/lib/queue";
import { SIGNATURE_HEADER, signWebhookBody } from "./signature";
import { API_SCHEMA_VERSION, API_SCHEMA_VERSION_HEADER, WEBHOOK_MAX_CONSECUTIVE_FAILURES, WEBHOOK_PER_ENDPOINT_CONCURRENCY, WEBHOOK_TIMEOUT_SECONDS } from "@/lib/api/constants";

// Tras tantas entregas fallidas SEGUIDAS (cada una ya agotó sus reintentos) el
// endpoint se desactiva solo y se avisa a su dueño — un receptor muerto no
// debe acumular miles de jobs ni esconder que la integración está rota.
export { WEBHOOK_MAX_CONSECUTIVE_FAILURES } from "@/lib/api/constants";

export interface WebhookDeliveryJob {
  deliveryId: string;
}

// Concurrencia por endpoint: el worker entrega WEBHOOK_WORKER_CONCURRENCY (20)
// en paralelo, pero a un mismo endpoint como mucho WEBHOOK_PER_ENDPOINT_CONCURRENCY
// (2). Así un receptor lento (hasta 20 s por intento) no ocupa todos los
// lugares y los demás clientes siguen recibiendo. Semáforo en Redis (vale con
// varios workers); el TTL lo libera si un proceso muere a mitad de una entrega.
// Un job sin lugar se reprograma unos segundos después SIN gastar un intento.
const SLOT_TTL_SECONDS = WEBHOOK_TIMEOUT_SECONDS + 15;
const SLOT_RETRY_MIN_MS = 1000;
const SLOT_RETRY_JITTER_MS = 2000;
const slotKey = (endpointId: string) => `webhook-inflight:${endpointId}`;

export async function acquireEndpointSlot(endpointId: string, max = WEBHOOK_PER_ENDPOINT_CONCURRENCY): Promise<boolean> {
  const r = getRedisClient();
  const results = await r.multi().incr(slotKey(endpointId)).expire(slotKey(endpointId), SLOT_TTL_SECONDS).exec();
  const inFlight = Number(results?.[0]?.[1] ?? 0);
  if (inFlight <= max) return true;
  await r.decr(slotKey(endpointId));
  return false;
}

export async function releaseEndpointSlot(endpointId: string): Promise<void> {
  const r = getRedisClient();
  // Nunca bajo cero (p. ej. si el TTL ya lo había borrado).
  const left = await r.decr(slotKey(endpointId));
  if (left < 0) await r.set(slotKey(endpointId), 0, "EX", SLOT_TTL_SECONDS);
}

export async function processWebhookDelivery(job: Job<WebhookDeliveryJob>, token?: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    select: { endpointId: true, status: true },
  });
  if (!delivery || delivery.status === "SENT") return;

  // Sin token (llamada directa, p. ej. el botón "probar"): sin semáforo.
  if (token) {
    if (!(await acquireEndpointSlot(delivery.endpointId))) {
      await job.moveToDelayed(Date.now() + SLOT_RETRY_MIN_MS + Math.floor(Math.random() * SLOT_RETRY_JITTER_MS), token);
      throw new DelayedError();
    }
    try {
      return await deliverOnce(job);
    } finally {
      await releaseEndpointSlot(delivery.endpointId).catch(() => {});
    }
  }
  return deliverOnce(job);
}

async function deliverOnce(job: Job<WebhookDeliveryJob>): Promise<void> {
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
        "X-Colibly-Event": delivery.eventType,
        "X-Colibly-Delivery": delivery.id,
        // Agregados (compatibles): id del evento para deduplicar entre
        // endpoints/reintentos sin parsear el cuerpo, número de intento y un
        // User-Agent identificable para listas de permitidos.
        "X-Colibly-Event-Id": delivery.eventId,
        "X-Colibly-Attempt": String(attempt),
        [API_SCHEMA_VERSION_HEADER]: API_SCHEMA_VERSION,
        "User-Agent": "Colibly-Webhooks/1.0",
      },
      maxResponseBytes: 4096,
      timeoutMs: WEBHOOK_TIMEOUT_SECONDS * 1000,
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
