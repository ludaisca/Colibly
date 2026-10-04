import { z } from "zod";
import type { WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";
import { parseSafeUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { generateWebhookSecret } from "./signature";
import { orgWhere, requireOrgId } from "@/lib/tenancy";

// Alta/edición de webhooks — compartido por /api/configuracion/webhooks (UI,
// sesión de admin) y /api/v1/webhooks (API key con webhooks:manage).

const eventsSchema = z
  .array(z.string())
  .min(1, "Elige al menos un evento")
  .refine((list) => list.every((e) => e === "*" || (DOMAIN_EVENT_TYPES as string[]).includes(e)), "Evento desconocido");

export const webhookCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(80),
  url: z.string().trim().min(1, "La URL es requerida").max(2000),
  events: eventsSchema,
  accountIds: z.array(z.string()).max(100).default([]),
  channelAccountIds: z.array(z.string()).max(100).default([]),
});

export const webhookUpdateSchema = webhookCreateSchema.partial().extend({ active: z.boolean().optional() });

export class WebhookInputError extends Error {}

// La URL y las cuentas se validan contra lo que el dueño puede ver: un id de
// cuenta ajena en `accountIds` no debe quedar guardado aunque luego el fanout
// lo ignorara.
async function validateTargets(ownerId: string, input: { url?: string; accountIds?: string[]; channelAccountIds?: string[] }) {
  if (input.url !== undefined) {
    try {
      parseSafeUrl(input.url);
    } catch (err) {
      throw new WebhookInputError(err instanceof SafeFetchError ? err.message : "URL no válida");
    }
  }
  if (input.accountIds?.length) {
    const own = await getUserAccountIds(ownerId);
    if (input.accountIds.some((id) => !own.includes(id))) throw new WebhookInputError("Cuenta de WhatsApp no válida");
  }
  if (input.channelAccountIds?.length) {
    const own = await getUserChannelAccountIds(ownerId);
    if (input.channelAccountIds.some((id) => !own.includes(id))) throw new WebhookInputError("Cuenta de canal no válida");
  }
}

// Devuelve el endpoint y el secreto en claro — única vez que se muestra.
export async function createWebhook(ownerId: string, input: z.infer<typeof webhookCreateSchema>) {
  await validateTargets(ownerId, input);
  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { ...input, userId: ownerId, organizationId: await requireOrgId(ownerId), secret: encrypt(secret) },
  });
  return { endpoint, secret };
}

export async function updateWebhook(ownerId: string, id: string, input: z.infer<typeof webhookUpdateSchema>) {
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id, ...(await orgWhere(ownerId)) } });
  if (!existing) return null;
  await validateTargets(ownerId, input);
  const reactivating = input.active === true && !existing.active;
  return prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...input,
      // Reactivar a mano borra el contador: si no, el siguiente fallo aislado
      // lo volvería a desactivar de inmediato.
      ...(reactivating ? { disabledAt: null, consecutiveFailures: 0 } : {}),
    },
  });
}

export async function rotateWebhookSecret(ownerId: string, id: string) {
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id, ...(await orgWhere(ownerId)) }, select: { id: true } });
  if (!existing) return null;
  const secret = generateWebhookSecret();
  await prisma.webhookEndpoint.update({ where: { id }, data: { secret: encrypt(secret) } });
  return secret;
}

export function serializeWebhook(e: WebhookEndpoint) {
  return {
    id: e.id,
    name: e.name,
    url: e.url,
    events: e.events,
    accountIds: e.accountIds,
    channelAccountIds: e.channelAccountIds,
    active: e.active,
    disabledAt: e.disabledAt,
    consecutiveFailures: e.consecutiveFailures,
    lastDeliveryAt: e.lastDeliveryAt,
    createdAt: e.createdAt,
  };
}
