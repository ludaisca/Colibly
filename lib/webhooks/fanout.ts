import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";
import type { DomainEvent } from "@/lib/events/types";
import { resolveIntegrationScope, scopeIncludes, type ResolvedScope } from "@/lib/integrations/account-scope";
import { buildPublicEvent, type PublicEvent } from "./payload";
import { isOrgWritable, orgIdForAccount } from "@/lib/billing/gates";
import { integrationOwnerHas } from "@/lib/billing/entitlements";

// Worker de domain-events → una WebhookDelivery por endpoint que coincide
// (tipo de evento + alcance de cuentas de su dueño) y un job de entrega por
// cada una. El @@unique([endpointId, eventId]) hace idempotente el reintento
// de este mismo job: no se duplican entregas.
export async function fanOutToWebhooks(event: DomainEvent): Promise<number> {
  // Multi-tenant: solo los endpoints de la organización dueña de la cuenta
  // del evento (antes se filtraba endpoint por endpoint después de leerlos todos).
  const organizationId = await orgIdForAccount(
    event.account.kind === "whatsapp" ? { waAccountId: event.account.id } : { channelAccountId: event.account.id }
  );
  if (!organizationId) return 0;
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      organizationId,
      active: true,
      disabledAt: null,
      events: { hasSome: [event.type, "*"] },
      // Defensa extra por si el rol cambió por otra vía que no pausó (SQL, soporte).
      user: { role: "admin", disabledAt: null },
    },
    select: { id: true, userId: true, organizationId: true, accountIds: true, channelAccountIds: true },
  });
  if (endpoints.length === 0) return 0;

  const scopeByOwner = new Map<string, Promise<ResolvedScope>>();
  let payload: PublicEvent | null = null;
  let created = 0;

  // Webhooks salientes: con la cuenta al corriente y un dueño admin cuya
  // licencia los incluya (regla 5 de las licencias).
  const writable = new Map<string, Promise<boolean>>();
  const ownerAllowed = new Map<string, Promise<boolean>>();
  const canReceive = async (endpoint: { userId: string; organizationId: string }) => {
    if (!writable.has(endpoint.organizationId)) writable.set(endpoint.organizationId, isOrgWritable(endpoint.organizationId));
    if (!ownerAllowed.has(endpoint.userId)) ownerAllowed.set(endpoint.userId, integrationOwnerHas(endpoint.userId, "webhooks"));
    return (await writable.get(endpoint.organizationId)!) && (await ownerAllowed.get(endpoint.userId)!);
  };

  for (const endpoint of endpoints) {
    if (!(await canReceive(endpoint))) continue;
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
