import { prisma } from "@/lib/prisma";

// Costo estimado de la IA de una organización (lo que le cuesta a la
// plataforma, no lo que paga el cliente — el cliente consume créditos, ver
// lib/ai/credits.ts). Suma las cuatro fuentes de uso: respuestas de bots
// (WABotUsage), calificaciones (WALeadScorerUsage), mensajes de recuperación
// (WALeadRecoveryAttempt), pasos de IA de automatizaciones (AutomationAiUsage)
// y asistencia al equipo — reescribir, tareas, transcripción, monitores
// (AiAssistUsage).
export async function getOrgAiCost(organizationId: string, since: Date): Promise<number> {
  const [botUsage, scorerUsage, recoveryUsage, automationUsage, assistUsage] = await Promise.all([
    prisma.wABotUsage.aggregate({
      where: { bot: { organizationId }, createdAt: { gte: since } },
      _sum: { estimatedCost: true },
    }),
    prisma.wALeadScorerUsage.aggregate({
      where: { scorer: { organizationId }, createdAt: { gte: since } },
      _sum: { estimatedCost: true },
    }),
    // Los intentos de Telegram/Messenger/Instagram guardan conversationId sin
    // relación declarada: se filtran por los ids de las conversaciones.
    prisma.conversation
      .findMany({ where: { channelAccount: { organizationId } }, select: { id: true } })
      .then((convs) =>
        prisma.wALeadRecoveryAttempt.aggregate({
          where: {
            OR: [{ chat: { account: { organizationId } } }, { conversationId: { in: convs.map((c) => c.id) } }],
            createdAt: { gte: since },
          },
          _sum: { estimatedCost: true },
        })
      ),
    prisma.automationAiUsage.aggregate({
      where: { automation: { organizationId }, createdAt: { gte: since } },
      _sum: { estimatedCost: true },
    }),
    prisma.aiAssistUsage.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { estimatedCost: true },
    }),
  ]);

  return (
    (botUsage._sum.estimatedCost ?? 0) +
    (scorerUsage._sum.estimatedCost ?? 0) +
    (recoveryUsage._sum.estimatedCost ?? 0) +
    (automationUsage._sum.estimatedCost ?? 0) +
    (assistUsage._sum.estimatedCost ?? 0)
  );
}
