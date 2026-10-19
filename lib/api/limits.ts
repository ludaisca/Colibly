import { prisma } from "@/lib/prisma";

// Topes por organización (no dependen del plan: Pro los incluye igual). Una
// integración normal usa 1-3 keys y 1-3 webhooks; el tope acota el costo de
// cada evento (cada webhook es una entrega más en la cola) y el daño de un
// script que crea keys en bucle. Las cuentas internas no tienen tope.
import { MAX_ACTIVE_API_KEYS, MAX_WEBHOOKS } from "./constants";
export { MAX_ACTIVE_API_KEYS, MAX_WEBHOOKS };

export interface CapExceeded {
  message: string;
  current: number;
  max: number;
}

async function isInternalOrg(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { isInternal: true } });
  return !!org?.isInternal;
}

// Activas = no revocadas y no vencidas (las vencidas/revocadas no cuentan).
export async function apiKeyCapExceeded(organizationId: string): Promise<CapExceeded | null> {
  if (await isInternalOrg(organizationId)) return null;
  const current = await prisma.apiKey.count({
    where: { organizationId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (current < MAX_ACTIVE_API_KEYS) return null;
  return {
    current,
    max: MAX_ACTIVE_API_KEYS,
    message: `Tu cuenta ya tiene ${MAX_ACTIVE_API_KEYS} API keys activas, el máximo. Revoca una que ya no uses para crear otra.`,
  };
}

// Cuentan todos los webhooks (activos, pausados o desactivados): uno
// desactivado se reactiva con un clic, así que sigue ocupando su lugar.
export async function webhookCapExceeded(organizationId: string): Promise<CapExceeded | null> {
  if (await isInternalOrg(organizationId)) return null;
  const current = await prisma.webhookEndpoint.count({ where: { organizationId } });
  if (current < MAX_WEBHOOKS) return null;
  return {
    current,
    max: MAX_WEBHOOKS,
    message: `Tu cuenta ya tiene ${MAX_WEBHOOKS} webhooks, el máximo. Borra uno que ya no uses para crear otro.`,
  };
}
