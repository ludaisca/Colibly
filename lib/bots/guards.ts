import { prisma } from "@/lib/prisma";

// Reglas compartidas por los 3 bot-workers (WhatsApp, Telegram/Web,
// Messenger/Instagram) para decidir si un job de respuesta automática debe
// correr. Existen porque el pipeline encola un job por cada mensaje entrante
// sin mirar el contexto de la conversación.

// Retraso con el que se encola cada job de bot. Da tiempo a que lleguen los
// mensajes "en ráfaga" ("hola" + "quiero info") — solo el job del último
// responde, con los anteriores ya incluidos en su historial.
export const BOT_REPLY_DEBOUNCE_MS = 4_000;

// Si un agente humano respondió en la conversación dentro de esta ventana,
// el bot no interviene — antes bot y agente se pisaban en el mismo chat.
// Pasada la ventana sin actividad humana, el bot retoma.
export const BOT_HUMAN_TAKEOVER_MINUTES = 30;

// Tras un paso "Pasar a humano", el bot no retoma el chat en este plazo.
export const AUTOMATION_HANDOFF_HOURS = 24;

export type BotChatRef = { waChatId: string } | { conversationId: string };

// Devuelve el motivo por el que el bot NO debe responder, o null si puede.
export async function getBotSkipReason(
  ref: BotChatRef,
  triggerMessageId: string | null | undefined,
  now: Date = new Date()
): Promise<string | null> {
  const takeoverSince = new Date(now.getTime() - BOT_HUMAN_TAKEOVER_MINUTES * 60_000);

  // Automatizaciones: mientras una conversacional tiene el chat, o durante
  // AUTOMATION_HANDOFF_HOURS después de pasarlo a un humano, el bot no habla
  // encima. HANDED_TO_BOT no bloquea: es justo la que le cede el turno.
  const automationHold = await prisma.automationRun.findFirst({
    where: {
      ...("waChatId" in ref ? { waChatId: ref.waChatId } : { conversationId: ref.conversationId }),
      OR: [
        { conversational: true, status: { in: ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY"] } },
        { status: "HANDED_OFF", endedAt: { gte: new Date(now.getTime() - AUTOMATION_HANDOFF_HOURS * 3_600_000) } },
      ],
    },
    select: { status: true },
  });
  if (automationHold) {
    return automationHold.status === "HANDED_OFF"
      ? "una automatización pasó la conversación a un humano"
      : "una automatización está atendiendo el chat";
  }

  if ("waChatId" in ref) {
    const humanReply = await prisma.wAMessage.findFirst({
      where: { chatId: ref.waChatId, direction: "OUTBOUND", senderId: { not: null }, createdAt: { gte: takeoverSince } },
      select: { id: true },
    });
    if (humanReply) return `un agente respondió en los últimos ${BOT_HUMAN_TAKEOVER_MINUTES} min`;

    if (triggerMessageId) {
      const trigger = await prisma.wAMessage.findUnique({ where: { id: triggerMessageId }, select: { createdAt: true } });
      if (trigger) {
        const newer = await prisma.wAMessage.findFirst({
          where: { chatId: ref.waChatId, direction: "INBOUND", id: { not: triggerMessageId }, createdAt: { gt: trigger.createdAt } },
          select: { id: true },
        });
        if (newer) return "llegó un mensaje más reciente (lo responde su propio job)";
      }
    }
    return null;
  }

  const humanReply = await prisma.channelMessage.findFirst({
    where: { conversationId: ref.conversationId, direction: "OUTBOUND", senderId: { not: null }, createdAt: { gte: takeoverSince } },
    select: { id: true },
  });
  if (humanReply) return `un agente respondió en los últimos ${BOT_HUMAN_TAKEOVER_MINUTES} min`;

  if (triggerMessageId) {
    const trigger = await prisma.channelMessage.findUnique({ where: { id: triggerMessageId }, select: { createdAt: true } });
    if (trigger) {
      const newer = await prisma.channelMessage.findFirst({
        where: { conversationId: ref.conversationId, direction: "INBOUND", id: { not: triggerMessageId }, createdAt: { gt: trigger.createdAt } },
        select: { id: true },
      });
      if (newer) return "llegó un mensaje más reciente (lo responde su propio job)";
    }
  }
  return null;
}

// Otro bot ACTIVO sobre la misma cuenta, si existe — solo puede haber uno por
// cuenta (antes cada bot activo encolaba su propia respuesta al mismo mensaje).
export async function findOtherActiveBot(
  botId: string | null,
  account: { waAccountId?: string | null; channelAccountId?: string | null }
): Promise<{ id: string; name: string } | null> {
  if (!account.waAccountId && !account.channelAccountId) return null;
  return prisma.wABot.findFirst({
    where: {
      isActive: true,
      ...(botId ? { id: { not: botId } } : {}),
      ...(account.waAccountId ? { waAccountId: account.waAccountId } : { channelAccountId: account.channelAccountId! }),
    },
    select: { id: true, name: true },
  });
}
