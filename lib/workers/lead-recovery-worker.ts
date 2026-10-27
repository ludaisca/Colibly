import { prisma } from "@/lib/prisma";
import { sendRecoveryMessage, isWithinBusinessHours, isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";
import { sendTelegramRecoveryMessage } from "@/lib/telegram/lead-recovery";
import { sendMetaChannelRecoveryMessage } from "@/lib/meta-messaging/lead-recovery";
import { hasAiCredits, reserveAiCredit } from "@/lib/ai/credits";
import type { Organization, WABot, WAAccount, ChannelAccount } from "@prisma/client";
import { hasBotsAccess, isOrgWritable } from "@/lib/billing/gates";

// Scheduled runs are unattended, so keep each tick's blast radius bounded —
// same reasoning as lead-scoring-worker.ts's CANDIDATE_POOL/BATCH_SIZE.
const CANDIDATE_POOL = 200;
const BATCH_SIZE = 20;
const HOUR_MS = 3_600_000;

// Rango de `lastMessageAt` que vale la pena revisar. Antes el pool eran los
// 200 chats más RECIENTES: en una cuenta con más de 200 chats activos, los
// silencios viejos — justo los que hay que recuperar — nunca entraban. Ahora
// se excluye la actividad de la última hora (unidad mínima configurable) y lo
// demasiado viejo, y se recorre del silencio más antiguo al más nuevo.
function candidateWindow(now: Date, maxAgeHours: number) {
  return { lte: new Date(now.getTime() - HOUR_MS), gte: new Date(now.getTime() - maxAgeHours * HOUR_MS) };
}

export async function processLeadRecoveryTick() {
  const now = new Date();

  // La configuración es de la organización (una sola pasada por empresa, no
  // una por cada admin que la hubiera activado).
  const orgs = await prisma.organization.findMany({
    where: { leadRecoveryEnabled: true, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
  });

  for (const org of orgs) {
    try {
      await runRecoveryForOrg(org, now);
    } catch (err) {
      console.error(`[lead-recovery] Error ejecutando recuperación para la organización ${org.id}:`, err);
    }
  }
}

async function runRecoveryForOrg(settings: Organization, now: Date) {
  if (!(await isOrgWritable(settings.id))) return;
  if (!(await hasBotsAccess(settings.id))) return;
  if (!(await hasAiCredits(settings.id, now))) {
    console.log(`[lead-recovery] Sin créditos de IA, se omite la recuperación de la organización ${settings.id} en este ciclo`);
    return;
  }

  if (
    !isWithinBusinessHours(now, {
      timezone: settings.timezone,
      startHour: settings.businessHourStart,
      endHour: settings.businessHourEnd,
    })
  ) {
    return; // fuera de horario — se reintenta en el próximo tick
  }

  const accountIds = (await prisma.wAAccount.findMany({ where: { organizationId: settings.id }, select: { id: true } })).map((a) => a.id);
  if (accountIds.length === 0 && !(await prisma.channelAccount.count({ where: { organizationId: settings.id } }))) return;

  const candidates = await prisma.wAChat.findMany({
    where: {
      accountId: { in: accountIds },
      status: { in: ["OPEN", "PENDING"] },
      NOT: { contact: { overLimit: true } },
      // Debe haber habido conversación real — un chat que solo recibió una
      // campaña y nunca contestó no es un lead "abandonado", nunca se enganchó.
      messages: { some: { direction: "INBOUND" } },
      // WhatsApp: pasadas 24h del último mensaje ya no se puede escribir texto
      // libre (lastMessageAt ≥ último INBOUND, así que esto no deja fuera a nadie
      // que todavía esté dentro de la ventana).
      lastMessageAt: candidateWindow(now, 24),
    },
    select: {
      id: true,
      accountId: true,
      remoteJid: true,
      messages: { orderBy: { timestamp: "desc" }, take: 1, select: { direction: true } },
    },
    orderBy: { lastMessageAt: "asc" },
    take: CANDIDATE_POOL,
  });

  const silentChats = candidates.filter((c) => c.messages[0]?.direction === "OUTBOUND");

  const botCache = new Map<string, (WABot & { waAccount: WAAccount | null }) | null>();
  let sentCount = 0;
  // Un crédito por mensaje generado; al agotarse, el tick termina para esta organización.
  let outOfCredits = false;

  for (const chat of silentChats) {
    if (sentCount >= BATCH_SIZE) break;

    const lastInbound = await prisma.wAMessage.findFirst({
      where: { chatId: chat.id, direction: "INBOUND" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    if (!lastInbound) continue;
    // Fuera de la ventana de 24h de Meta no se puede enviar texto libre — antes
    // se intentaba igual y sendRecoveryMessage() lanzaba, dejando un error en
    // el log cada 15 min por cada chat así.
    if (!isWithinServiceWindow(lastInbound.timestamp, now)) continue;

    const hoursSilent = (now.getTime() - lastInbound.timestamp.getTime()) / 3_600_000;

    const attemptsSoFar = await prisma.wALeadRecoveryAttempt.count({
      where: { chatId: chat.id, createdAt: { gt: lastInbound.timestamp } },
    });

    let attemptNumber: 1 | 2 | null = null;
    if (attemptsSoFar === 0 && hoursSilent >= settings.leadRecoveryFirstMessageHours) {
      attemptNumber = 1;
    } else if (
      attemptsSoFar === 1 &&
      settings.leadRecoverySecondMessageHours !== null &&
      hoursSilent >= settings.leadRecoverySecondMessageHours
    ) {
      attemptNumber = 2;
    }
    if (attemptNumber === null) continue;

    if (!botCache.has(chat.accountId)) {
      const bot = await prisma.wABot.findFirst({
        where: { waAccountId: chat.accountId, isActive: true, status: "ACTIVE" },
        include: { waAccount: true },
      });
      botCache.set(chat.accountId, bot);
    }
    const bot = botCache.get(chat.accountId);
    if (!bot) continue; // sin bot activo en esa cuenta, no hay con qué generar el mensaje

    if (!(await reserveAiCredit(settings.id, now))) {
      outOfCredits = true;
      break;
    }
    try {
      await sendRecoveryMessage(chat, bot, attemptNumber, lastInbound.timestamp, now);
      sentCount++;
    } catch (err) {
      console.error(`[lead-recovery] Error enviando reactivación al chat ${chat.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // Canales genéricos (Telegram/Messenger/Instagram) — mismo criterio de
  // candidatos que arriba, pero sin la ventana de 24h de Meta (ninguno de
  // los tres la impone), y comparte el mismo presupuesto sentCount/BATCH_SIZE
  // del tick. El envío se despacha según el channel real de cada cuenta
  // (channelBot.channelAccount.channel) — antes de este fix siempre se
  // llamaba sendTelegramRecoveryMessage() sin importar el canal, así que una
  // ChannelAccount de Messenger/Instagram (credentials sin `botToken`) hacía
  // fallar el envío en silencio y la recuperación nunca ocurría para esos dos
  // canales (ver lib/meta-messaging/lead-recovery.ts).
  const channelAccountIds = (await prisma.channelAccount.findMany({ where: { organizationId: settings.id }, select: { id: true } })).map((a) => a.id);
  if (channelAccountIds.length > 0 && !outOfCredits) {
    const channelCandidates = await prisma.conversation.findMany({
      where: {
        channelAccountId: { in: channelAccountIds },
        status: { in: ["OPEN", "PENDING"] },
        NOT: { contact: { overLimit: true } },
        messages: { some: { direction: "INBOUND" } },
        // Sin ventana de 24h en estos canales, pero tampoco tiene sentido
        // "recuperar" silencios de semanas: hasta 48h después del último intento.
        lastMessageAt: candidateWindow(
          now,
          (settings.leadRecoverySecondMessageHours ?? settings.leadRecoveryFirstMessageHours) + 48
        ),
      },
      select: {
        id: true,
        channelAccountId: true,
        externalId: true,
        messages: { orderBy: { timestamp: "desc" }, take: 1, select: { direction: true } },
      },
      orderBy: { lastMessageAt: "asc" },
      take: CANDIDATE_POOL,
    });

    const silentConversations = channelCandidates.filter((c) => c.messages[0]?.direction === "OUTBOUND");
    const channelBotCache = new Map<string, (WABot & { channelAccount: ChannelAccount | null }) | null>();

    for (const conv of silentConversations) {
      if (sentCount >= BATCH_SIZE) break;

      const lastInbound = await prisma.channelMessage.findFirst({
        where: { conversationId: conv.id, direction: "INBOUND" },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      });
      if (!lastInbound) continue;

      const hoursSilent = (now.getTime() - lastInbound.timestamp.getTime()) / 3_600_000;

      const attemptsSoFar = await prisma.wALeadRecoveryAttempt.count({
        where: { conversationId: conv.id, createdAt: { gt: lastInbound.timestamp } },
      });

      let attemptNumber: 1 | 2 | null = null;
      if (attemptsSoFar === 0 && hoursSilent >= settings.leadRecoveryFirstMessageHours) {
        attemptNumber = 1;
      } else if (
        attemptsSoFar === 1 &&
        settings.leadRecoverySecondMessageHours !== null &&
        hoursSilent >= settings.leadRecoverySecondMessageHours
      ) {
        attemptNumber = 2;
      }
      if (attemptNumber === null) continue;

      if (!channelBotCache.has(conv.channelAccountId)) {
        const bot = await prisma.wABot.findFirst({
          where: { channelAccountId: conv.channelAccountId, isActive: true, status: "ACTIVE" },
          include: { channelAccount: true },
        });
        channelBotCache.set(conv.channelAccountId, bot);
      }
      const channelBot = channelBotCache.get(conv.channelAccountId);
      if (!channelBot?.channelAccount) continue;

      if (!(await reserveAiCredit(settings.id, now))) break;
      try {
        if (channelBot.channelAccount.channel === "TELEGRAM") {
          await sendTelegramRecoveryMessage(conv, channelBot, attemptNumber, now);
        } else {
          await sendMetaChannelRecoveryMessage(conv, channelBot, attemptNumber, now);
        }
        sentCount++;
      } catch (err) {
        console.error(`[lead-recovery] Error enviando reactivación a la conversación ${conv.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}
