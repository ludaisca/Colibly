import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";
import type { DomainEvent } from "@/lib/events/types";
import { resolveIntegrationScope, scopeIncludes, type ResolvedScope } from "@/lib/integrations/account-scope";
import { buildPublicEvent, type PublicEvent } from "./payload";

// Worker de domain-events → una WebhookDelivery por endpoint que coincide
// (tipo de evento + alcance de cuentas de su dueño) y un job de entrega por
// cada una. El @@unique([endpointId, eventId]) hace idempotente el reintento
// de este mismo job: no se duplican entregas.
export async function fanOutToWebhooks(event: DomainEvent): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { active: true, disabledAt: null, events: { hasSome: [event.type, "*"] } },
    select: { id: true, userId: true, accountIds: true, channelAccountIds: true },
  });
  if (endpoints.length === 0) return 0;

  const scopeByOwner = new Map<string, Promise<ResolvedScope>>();
  let payload: PublicEvent | null = null;
  let created = 0;

  for (const endpoint of endpoints) {
    const scopeKey = `${endpoint.userId}:${endpoint.accountIds.join(",")}:${endpoint.channelAccountIds.join(",")}`;
    if (!scopeByOwner.has(scopeKey)) {
      scopeByOwner.set(scopeKey, resolveIntegrationScope(endpoint.userId, endpoint));
    }
    if (!scopeIncludes(await scopeByOwner.get(scopeKey)!, event.account)) continue;

    payload ??= await buildPublicEvent(event);
    const delivery = await createDelivery(endpoint.id, payload);
    if (delivery) {
      await webhookDeliveryQueue.add("deliver", { deliveryId: delivery.id }, { jobId: delivery.id });
      created++;
    }
  }
  return created;
}

export async function createDelivery(endpointId: string, payload: PublicEvent) {
  try {
    return await prisma.webhookDelivery.create({
      data: {
        endpointId,
        eventId: payload.id,
        eventType: payload.type,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}
