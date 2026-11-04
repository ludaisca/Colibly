import type { WebhookDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";

// Reenvío manual de una entrega (botón "Reintentar" de Configuración → API y
// POST /api/v1/webhooks/{id}/deliveries/{deliveryId}/replay). Es la MISMA
// entrega: mismo cuerpo y mismo eventId (el receptor deduplica con él), con
// los intentos desde cero. jobId nuevo: el original ya existe en BullMQ como
// job terminado y un add con el mismo id se ignoraría.

export type ReplayRefusal = "in_progress" | "not_allowed" | "endpoint_inactive";

export async function replayDelivery(
  delivery: { id: string; status: WebhookDeliveryStatus; endpoint: { active: boolean; disabledAt: Date | null } },
  allowed: WebhookDeliveryStatus[] = ["FAILED"]
): Promise<{ ok: true } | { ok: false; reason: ReplayRefusal }> {
  if (delivery.status === "PENDING") return { ok: false, reason: "in_progress" };
  if (!allowed.includes(delivery.status)) return { ok: false, reason: "not_allowed" };
  if (!delivery.endpoint.active || delivery.endpoint.disabledAt) return { ok: false, reason: "endpoint_inactive" };
  // Atómico: dos reenvíos simultáneos no encolan dos veces.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id: delivery.id, status: delivery.status },
    data: { status: "PENDING", attempts: 0, error: null },
  });
  if (claimed.count === 0) return { ok: false, reason: "in_progress" };
  await webhookDeliveryQueue.add("deliver", { deliveryId: delivery.id }, { jobId: `${delivery.id}-retry-${Date.now()}` });
  return { ok: true };
}

export const DELIVERY_PUBLIC_SELECT = {
  id: true,
  eventId: true,
  eventType: true,
  status: true,
  attempts: true,
  responseCode: true,
  error: true,
  createdAt: true,
  deliveredAt: true,
} as const;

// Forma pública de una entrega (sin el cuerpo).
export function serializeDelivery(d: {
  id: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseCode: number | null;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}) {
  return {
    id: d.id,
    eventId: d.eventId,
    eventType: d.eventType,
    status: d.status.toLowerCase(),
    attempts: d.attempts,
    responseCode: d.responseCode,
    error: d.error,
    createdAt: d.createdAt,
    deliveredAt: d.deliveredAt,
  };
}
