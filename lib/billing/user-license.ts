import { Prisma, type PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TRIAL_LICENSE } from "./licenses";
import { invalidateChannelEntitlement } from "./entitlements";

// Licencias por usuario y dueños de canal (docs/PLAN_LICENCIAS_2026-11-04.md).
// Los candados que leen estos datos están en entitlements.ts. En la Fase 3 la
// licencia de una persona nueva la elige el admin al invitarla.

/** Licencia con la que entra una persona nueva mientras no haya selector: el plan de la organización. */
export async function defaultLicenseFor(organizationId: string): Promise<PlanId> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true } });
  return org?.plan ?? TRIAL_LICENSE;
}

/**
 * Hace dueña de un canal recién conectado a quien lo conectó, si todavía no
 * es dueña de uno de ese tipo (una licencia ocupa uno de cada tipo). Si ya
 * tiene uno, el canal queda sin dueño: funciona como Básico (regla 3 del plan)
 * y la Fase 3 pide asignárselo a alguien.
 *
 * Se llama DESPUÉS de crear el canal: el índice único (owner_id en
 * wa_accounts, owner_id + channel en channel_accounts) decide si dos altas
 * simultáneas chocan, y la perdedora queda sin dueño en vez de fallar.
 * Nunca lanza: un error aquí no debe deshacer la conexión del canal.
 */
export async function claimChannelOwner(kind: "whatsapp" | "channel", accountId: string, userId: string): Promise<boolean> {
  try {
    if (kind === "whatsapp") {
      await prisma.wAAccount.update({ where: { id: accountId }, data: { ownerId: userId } });
    } else {
      await prisma.channelAccount.update({ where: { id: accountId }, data: { ownerId: userId } });
    }
    invalidateChannelEntitlement(kind === "whatsapp" ? { waAccountId: accountId } : { channelAccountId: accountId });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      console.warn(`[licencias] No se pudo asignar dueño al canal ${accountId}:`, error instanceof Error ? error.message : error);
    }
    return false;
  }
}
