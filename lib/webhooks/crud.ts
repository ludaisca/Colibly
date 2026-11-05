import { z } from "zod";
import type { WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";
import { parseSafeUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { generateWebhookSecret } from "./signature";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { webhookCapExceeded } from "@/lib/api/limits";
import { integrationFeatureMessage } from "@/lib/billing/entitlements";

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

export const webhookUpdateSchema = webhookCreateSchema.partial().extend({
  active: z.boolean().optional(),
  // El webhook pasa a ser de quien lo edita: sus entregas usan desde ahora el
  // alcance de cuentas de este admin. Obligatorio para reactivar uno pausado
  // porque su dueño perdió el acceso (lib/webhooks/ownership.ts).
  takeOwnership: z.boolean().optional(),
});

export class WebhookInputError extends Error {}
// Quien sería dueño del webhook no es admin con una licencia que incluya
// webhooks (regla 5 de las licencias). Las rutas responden 402.
export class WebhookAccessError extends Error {}

async function assertCanOwnWebhook(ownerId: string) {
  const blocked = await integrationFeatureMessage(ownerId, "webhooks");
  if (blocked) throw new WebhookAccessError(blocked);
}
// Tope de webhooks por organización (lib/api/limits.ts).
export class WebhookLimitError extends Error {
  constructor(message: string, public readonly current: number, public readonly max: number) {
    super(message);
  }
}

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
  const organizationId = await requireOrgId(ownerId);
  // Aquí y no en cada ruta: la pantalla y POST /api/v1/webhooks pasan por el
  // mismo candado (la API antes lo saltaba).
  await assertCanOwnWebhook(ownerId);
  const cap = await webhookCapExceeded(organizationId);
  if (cap) throw new WebhookLimitError(cap.message, cap.current, cap.max);
  await validateTargets(ownerId, input);
  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { ...input, userId: ownerId, organizationId, secret: encrypt(secret) },
  });
  return { endpoint, secret };
}

export async function updateWebhook(actorId: string, id: string, input: z.infer<typeof webhookUpdateSchema>) {
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id, ...(await orgWhere(actorId)) },
    include: { user: { select: { role: true, disabledAt: true } } },
  });
  if (!existing) return null;
  const { takeOwnership, ...fields } = input;
  const transfer = takeOwnership === true && existing.userId !== actorId;
  const reactivating = fields.active === true && !existing.active;
  const ownerLostAccess = existing.user.role !== "admin" || !!existing.user.disabledAt;
  if (reactivating && ownerLostAccess && !transfer) {
    throw new WebhookInputError("Su creador ya no es administrador: para reactivarlo, toma la propiedad del webhook (takeOwnership: true).");
  }
  const ownerId = transfer ? actorId : existing.userId;
  if (reactivating || transfer) await assertCanOwnWebhook(ownerId);
  // Al cambiar de dueño, el recorte de cuentas se valida contra el nuevo.
  await validateTargets(ownerId, transfer ? { ...fields, accountIds: fields.accountIds ?? existing.accountIds, channelAccountIds: fields.channelAccountIds ?? existing.channelAccountIds } : fields);
  return prisma.webhookEndpoint.update({
    where: { id: existing.id },
    data: {
      ...fields,
      ...(transfer ? { userId: actorId } : {}),
      // Reactivar a mano borra el contador: si no, el siguiente fallo aislado
      // lo volvería a desactivar de inmediato.
      ...(reactivating ? { disabledAt: null, consecutiveFailures: 0, pausedAt: null, pausedReason: null } : {}),
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

// active → entrega; paused → su dueño perdió el acceso; disabled → se apagó
// solo por fallos seguidos; inactive → lo apagó un admin.
export type WebhookStatus = "active" | "paused" | "disabled" | "inactive";

export function webhookStatus(e: Pick<WebhookEndpoint, "active" | "pausedAt" | "disabledAt">): WebhookStatus {
  if (e.active && !e.disabledAt) return "active";
  if (e.pausedAt) return "paused";
  if (e.disabledAt) return "disabled";
  return "inactive";
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
    status: webhookStatus(e),
    ownerId: e.userId,
    pausedAt: e.pausedAt,
    pausedReason: e.pausedReason,
    disabledAt: e.disabledAt,
    consecutiveFailures: e.consecutiveFailures,
    lastDeliveryAt: e.lastDeliveryAt,
    createdAt: e.createdAt,
  };
}
