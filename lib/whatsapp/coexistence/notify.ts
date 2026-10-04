import { prisma } from "@/lib/prisma";

// Avisos de la conexión de WhatsApp (sincronización vencida, desconexión, token
// por vencer) a los admins activos de la organización, en la campana. Tipo
// ACCOUNT_STATUS, el mismo que usan las restricciones y la calidad del número.
export async function notifyAccountAdmins(
  organizationId: string,
  notice: { title: string; body: string; accountId: string }
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { organizationId, role: "admin", disabledAt: null },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "ACCOUNT_STATUS" as const,
      title: notice.title,
      body: notice.body.slice(0, 300),
      link: `/whatsapp/cuentas/${notice.accountId}`,
    })),
  });
}
