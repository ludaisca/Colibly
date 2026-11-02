import { prisma } from "@/lib/prisma";
import { inboxQueue } from "@/lib/queue";
import { isOrgWritable } from "@/lib/billing/gates";
import { getOrgBusinessHours } from "@/lib/organizations";
import { isWithinBusinessHours } from "@/lib/dates/business-hours";
import { OutboundError, sendOutbound } from "@/lib/messaging/outbound";
import { AWAY_DEBOUNCE_MS, awayCooldownFloor, awaySkipReason } from "./away-message-rules";

// Aviso fuera de horario (Chatwoot: out_of_office_message).
//
// El ingest llama queueAwayMessage() SOLO cuando ni una automatización tomó el
// mensaje (suppressBot) ni hay un bot activo — decisión del usuario: el bot
// gana. El job se ejecuta 4 s después (agrupa ráfagas) y vuelve a comprobar
// todo antes de mandar: horario, cooldown de 12 h por chat (claim atómico de
// awayMessageSentAt), que nadie haya contestado en ese intervalo y que la
// organización pueda escribir. El aviso NO cuenta como respuesta: el chat
// sigue en "Esperando respuesta" para el equipo a la mañana siguiente.

type ChatKind = "whatsapp" | "channel";

export interface AwayJob {
  kind: ChatKind;
  chatId: string;
}

/**
 * Encola el aviso si la organización lo tiene activo. Una consulta pequeña
 * (la bandera de la organización); nunca lanza para no tumbar el ingest.
 */
export async function queueAwayMessage(
  kind: ChatKind,
  chatId: string,
  accountId: string,
  opts: { isGroup: boolean; isFromComment?: boolean }
): Promise<void> {
  if (opts.isGroup || opts.isFromComment) return;
  try {
    const org = kind === "whatsapp"
      ? (await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { organization: { select: { awayMessageEnabled: true } } } }))?.organization
      : (await prisma.channelAccount.findUnique({ where: { id: accountId }, select: { organization: { select: { awayMessageEnabled: true } } } }))?.organization;
    if (!org?.awayMessageEnabled) return;
    // jobId por chat y ventana de 4 s: una ráfaga de mensajes = un solo job.
    const bucket = Math.floor(Date.now() / AWAY_DEBOUNCE_MS);
    await inboxQueue.add("away-message", { kind, chatId } satisfies AwayJob, {
      delay: AWAY_DEBOUNCE_MS,
      jobId: `away-${chatId}-${bucket}`,
    });
  } catch (error) {
    console.error(`[away] no se pudo encolar el aviso para ${kind}:${chatId}`, error);
  }
}

export async function processAwayMessageJob(job: AwayJob, now = new Date()): Promise<"sent" | string> {
  const chat = job.kind === "whatsapp"
    ? await prisma.wAChat.findUnique({
        where: { id: job.chatId },
        include: { account: true },
      })
    : null;
  const conversation = job.kind === "channel"
    ? await prisma.conversation.findUnique({
        where: { id: job.chatId },
        include: { channelAccount: true },
      })
    : null;
  const row = chat ?? conversation;
  if (!row) return "missing";

  const organizationId = chat ? chat.account.organizationId : conversation!.channelAccount.organizationId;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { awayMessageEnabled: true, awayMessageText: true },
  });
  if (!org) return "missing";

  // ¿Se activó un bot o un flujo en estos segundos? Entonces él contesta.
  const activeBot = await prisma.wABot.findFirst({
    where: chat ? { waAccountId: chat.accountId, isActive: true, status: "ACTIVE" } : { channelAccountId: conversation!.channelAccountId, isActive: true, status: "ACTIVE" },
    select: { id: true },
  });
  // Mismo criterio que lib/bots/guards.ts: un flujo conversacional vivo.
  const liveRun = await prisma.automationRun.findFirst({
    where: {
      ...(chat ? { waChatId: chat.id } : { conversationId: conversation!.id }),
      conversational: true,
      status: { in: ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY"] },
    },
    select: { id: true },
  });

  const hours = await getOrgBusinessHours(organizationId);
  const reason = awaySkipReason({
    enabled: org.awayMessageEnabled,
    text: org.awayMessageText,
    inBusinessHours: isWithinBusinessHours(now, hours),
    lastSentAt: row.awayMessageSentAt,
    now,
    isGroup: row.isGroup,
    isFromComment: false,
    handledByBotOrFlow: Boolean(activeBot || liveRun),
  });
  if (reason) return reason;
  // Alguien contestó durante el debounce: ya no hace falta el aviso.
  if (!row.waitingSince) return "answered";
  if (!(await isOrgWritable(organizationId))) return "read_only";

  // Claim atómico del cooldown: dos jobs del mismo chat no mandan dos avisos.
  const floor = awayCooldownFloor(now);
  const claimWhere = { id: row.id, OR: [{ awayMessageSentAt: null }, { awayMessageSentAt: { lt: floor } }] };
  const claimed = chat
    ? await prisma.wAChat.updateMany({ where: claimWhere, data: { awayMessageSentAt: now } })
    : await prisma.conversation.updateMany({ where: claimWhere, data: { awayMessageSentAt: now } });
  if (claimed.count === 0) return "cooldown";

  const text = org.awayMessageText!.trim();
  try {
    if (chat) {
      await sendOutbound({ kind: "whatsapp", chat }, { type: "text", text }, { source: "automation", countsAsReply: false });
    } else {
      await sendOutbound({ kind: "channel", conversation: conversation! }, { type: "text", text }, { source: "automation", countsAsReply: false });
    }
    return "sent";
  } catch (error) {
    // El claim se queda: preferimos no reintentar a duplicar un aviso.
    if (error instanceof OutboundError) return `outbound_${error.code}`;
    console.error(`[away] no se pudo mandar el aviso a ${job.kind}:${job.chatId}`, error);
    return "error";
  }
}
