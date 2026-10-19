import { prisma } from "@/lib/prisma";

// Un webhook entrega datos de las cuentas que ve su DUEÑO (userId). Si el
// dueño deja de ser admin o se desactiva, sus webhooks se PAUSAN (no se
// borran): el destino y el secreto siguen ahí y otro admin los reactiva
// tomando la propiedad (updateWebhook con takeOwnership). Mismo criterio que
// las API keys, que dejan de funcionar en ese mismo momento.

export type PauseCause = "demoted" | "disabled";

const REASON: Record<PauseCause, string> = {
  demoted: "Su creador dejó de ser administrador",
  disabled: "Su creador fue desactivado",
};

export const WEBHOOKS_SETTINGS_LINK = "/configuracion/api?tab=webhooks";

export async function pauseWebhooksOfUser(userId: string, organizationId: string, cause: PauseCause, ownerName?: string | null): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId, organizationId, active: true },
    select: { id: true, name: true },
  });
  if (endpoints.length === 0) return 0;

  const reason = ownerName ? `${REASON[cause]} (${ownerName})` : REASON[cause];
  const { count } = await prisma.webhookEndpoint.updateMany({
    where: { id: { in: endpoints.map((e) => e.id) }, organizationId },
    data: { active: false, pausedAt: new Date(), pausedReason: reason },
  });

  const admins = await prisma.user.findMany({
    where: { organizationId, role: "admin", disabledAt: null, id: { not: userId } },
    select: { id: true },
  });
  if (admins.length > 0 && count > 0) {
    const names = endpoints.map((e) => `"${e.name}"`).join(", ");
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "INTEGRATION_ERROR" as const,
        title: count === 1 ? "Webhook pausado" : `${count} webhooks pausados`,
        body: `${reason}. Pausamos ${names} para que no siga enviando datos. Si la integración debe seguir, reactívalo y quedará a tu nombre.`,
        link: WEBHOOKS_SETTINGS_LINK,
      })),
    });
  }
  return count;
}
