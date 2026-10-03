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

export type BotControlState =
  | { kind: "automation"; name: string }
  | { kind: "handoff"; until: Date }
  | { kind: "human"; until: Date }
  | { kind: "available" };

export function humanTakeoverUntil(lastHumanAt: Date | null, botResumedAt: Date | null, now = new Date()): Date | null {
  if (!lastHumanAt || (botResumedAt && lastHumanAt <= botResumedAt)) return null;
  const until = new Date(lastHumanAt.getTime() + BOT_HUMAN_TAKEOVER_MINUTES * 60_000);
  return until > now ? until : null;
}

// Fuente única para el indicador y los workers. La asignación a un agente no
// implica takeover; solo una respuesta manual posterior a botResumedAt lo hace.
export async function getBotControlState(ref: BotChatRef, now = new Date()): Promise<BotControlState> {
  const chatWhere = "waChatId" in ref ? { waChatId: ref.waChatId } : { conversationId: ref.conversationId };
  const activeRun = await prisma.automationRun.findFirst({
    where: { ...chatWhere, conversational: true, status: { in: ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY"] } },
    orderBy: { startedAt: "desc" },
    select: { automation: { select: { name: true } } },
  });
  if (activeRun) return { kind: "automation", name: activeRun.automation.name };

  const handoff = await prisma.automationRun.findFirst({
    where: { ...chatWhere, status: "HANDED_OFF", endedAt: { gte: new Date(now.getTime() - AUTOMATION_HANDOFF_HOURS * 3_600_000) } },
    orderBy: { endedAt: "desc" },
    select: { endedAt: true },
  });
  if (handoff?.endedAt) return { kind: "handoff", until: new Date(handoff.endedAt.getTime() + AUTOMATION_HANDOFF_HOURS * 3_600_000) };

  const chat = "waChatId" in ref
    ? await prisma.wAChat.findUnique({ where: { id: ref.waChatId }, select: { botResumedAt: true } })
    : await prisma.conversation.findUnique({ where: { id: ref.conversationId }, select: { botResumedAt: true } });
  if (!chat) return { kind: "available" };
  const cutoff = new Date(now.getTime() - BOT_HUMAN_TAKEOVER_MINUTES * 60_000);
  const since = chat.botResumedAt && chat.botResumedAt > cutoff ? chat.botResumedAt : cutoff;
  const lastHuman = "waChatId" in ref
    ? await prisma.wAMessage.findFirst({
        // Un humano = un agente de Colibly (senderId) O el dueño escribiendo desde
        // la app WhatsApp Business de su teléfono (eco de coexistencia). El
        // historial importado (origin HISTORY) no cuenta: es pasado.
        where: {
          chatId: ref.waChatId,
          direction: "OUTBOUND",
          OR: [{ senderId: { not: null } }, { origin: "BUSINESS_APP_ECHO" }],
          createdAt: { gt: since },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : await prisma.channelMessage.findFirst({
        where: { conversationId: ref.conversationId, direction: "OUTBOUND", senderId: { not: null }, createdAt: { gt: since } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
  const until = humanTakeoverUntil(lastHuman?.createdAt ?? null, chat.botResumedAt, now);
  return until ? { kind: "human", until } : { kind: "available" };
}

// Devuelve el motivo por el que el bot NO debe responder, o null si puede.
export async function getBotSkipReason(
  ref: BotChatRef,
  triggerMessageId: string | null | undefined,
  now: Date = new Date()
): Promise<string | null> {
  const control = await getBotControlState(ref, now);
  if (control.kind === "automation") return "una automatización está atendiendo el chat";
  if (control.kind === "handoff") return "una automatización pasó la conversación a un humano";
  if (control.kind === "human") return `un agente respondió en los últimos ${BOT_HUMAN_TAKEOVER_MINUTES} min`;

  if ("waChatId" in ref) {
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
