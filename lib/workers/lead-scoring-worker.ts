import { prisma } from "@/lib/prisma";
import { scoreChatWithScorer } from "@/lib/whatsapp/lead-scoring";
import { checkBudgetAlert, isMonthlyBudgetExceeded } from "@/lib/ai/budget";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import type { WALeadScorerBot } from "@prisma/client";

// Scheduled runs are unattended, so keep each tick's blast radius bounded:
// only chats still "active" (OPEN/PENDING) and only ones that have new
// messages since this scorer last scored them — otherwise every enabled
// scorer would re-score its entire chat history every tick.
const BATCH_SIZE_PER_SCORER = 15;
const CANDIDATE_POOL = 200;

export async function processLeadScoringTick() {
  const now = new Date();

  const scorers = await prisma.wALeadScorerBot.findMany({
    where: { isActive: true, scheduleEnabled: true, scheduleIntervalMinutes: { not: null } },
  });

  for (const scorer of scorers) {
    const intervalMs = (scorer.scheduleIntervalMinutes ?? 0) * 60_000;
    const due = !scorer.lastRunAt || now.getTime() - scorer.lastRunAt.getTime() >= intervalMs;
    if (!due) continue;

    try {
      await runScheduledScorer(scorer, now);
    } catch (err) {
      console.error(`[lead-scoring] Error ejecutando calificador ${scorer.id}:`, err);
    }
  }
}

async function runScheduledScorer(scorer: WALeadScorerBot, now: Date) {
  if (await isMonthlyBudgetExceeded(scorer.userId, now)) {
    console.log(`[lead-scoring] Presupuesto mensual de IA superado, se omite el calificador ${scorer.id} en este ciclo`);
    return;
  }

  // Mirrors what manual scoring already allows (own + shared accounts, via
  // getUserAccountIds), further narrowed by the scorer's own account scope
  // (scheduleAccountIds) when one is configured — empty means "all of them".
  const eligibleAccountIds = await getUserAccountIds(scorer.userId);
  const scopedAccountIds = scorer.scheduleAccountIds.length > 0
    ? eligibleAccountIds.filter((id) => scorer.scheduleAccountIds.includes(id))
    : eligibleAccountIds;

  if (scopedAccountIds.length === 0) {
    await prisma.wALeadScorerBot.update({ where: { id: scorer.id }, data: { lastRunAt: now } });
    return;
  }

  const candidates = await prisma.wAChat.findMany({
    where: {
      accountId: { in: scopedAccountIds },
      status: { in: ["OPEN", "PENDING"] },
      lastMessageAt: { not: null },
      // Otherwise a campaign-only chat the lead never replied to would be reselected as
      // "due" on every single tick forever (scoreChatWithScorer throws before creating a
      // score, so it never satisfies the `!lastScore` exemption below) — crowding out
      // real candidates from the batch. scoreChatWithScorer enforces this same rule for
      // the manual "Calificar" button; this mirrors it here purely for efficiency.
      messages: { some: { direction: "INBOUND" } },
    },
    select: {
      id: true,
      lastMessageAt: true,
      leadScores: { where: { scorerId: scorer.id }, select: { updatedAt: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: CANDIDATE_POOL,
  });

  const dueChats = candidates
    .filter((c) => {
      const lastScore = c.leadScores[0];
      return !lastScore || (c.lastMessageAt !== null && lastScore.updatedAt < c.lastMessageAt);
    })
    .slice(0, BATCH_SIZE_PER_SCORER);

  let scoredAny = false;

  for (const chat of dueChats) {
    try {
      await scoreChatWithScorer(chat.id, scorer, "WHATSAPP");
      scoredAny = true;
    } catch (err) {
      console.error(`[lead-scoring] Error calificando chat ${chat.id} con el calificador ${scorer.id}:`, err);
    }
  }

  // Telegram — mismo criterio de candidatos que arriba, pero con su propio
  // tope BATCH_SIZE_PER_SCORER (no comparte cupo con la rama WhatsApp) y con
  // su propio alcance de cuentas (scheduleChannelAccountIds). Conversation no
  // tiene back-relation a WALeadScore (referencia blanda, sin @relation), así
  // que el filtro de "ya calificado, no obsoleto" va en una query separada.
  //
  // Solo Telegram: la calificación de leads es una decisión deliberada de NO
  // extenderse a Messenger/Instagram todavía (mismo límite que
  // `POST .../score` ya impone con un 400 — ver app/api/whatsapp/chats/[chatId]/score/route.ts).
  // getUserChannelAccountIds() devuelve cuentas de los tres canales sin
  // distinguir; sin este filtro, este tick calificaba conversaciones de
  // Messenger/Instagram igual —inconsistencia real con lo que la API permite
  // ver/pedir manualmente— así que se acota explícitamente a channel: "TELEGRAM".
  const eligibleChannelAccountIds = await getUserChannelAccountIds(scorer.userId);
  const scopedChannelAccountIds = scorer.scheduleChannelAccountIds.length > 0
    ? eligibleChannelAccountIds.filter((id) => scorer.scheduleChannelAccountIds.includes(id))
    : eligibleChannelAccountIds;
  const telegramAccountIds = scopedChannelAccountIds.length > 0
    ? (
        await prisma.channelAccount.findMany({
          where: { id: { in: scopedChannelAccountIds }, channel: "TELEGRAM" },
          select: { id: true },
        })
      ).map((a) => a.id)
    : [];

  if (telegramAccountIds.length > 0) {
    const tgCandidates = await prisma.conversation.findMany({
      where: {
        channelAccountId: { in: telegramAccountIds },
        status: { in: ["OPEN", "PENDING"] },
        lastMessageAt: { not: null },
        messages: { some: { direction: "INBOUND" } },
      },
      select: { id: true, lastMessageAt: true },
      orderBy: { lastMessageAt: "desc" },
      take: CANDIDATE_POOL,
    });

    const existingScores = await prisma.wALeadScore.findMany({
      where: { conversationId: { in: tgCandidates.map((c) => c.id) }, scorerId: scorer.id },
      select: { conversationId: true, updatedAt: true },
    });
    const lastScoreByConversation = new Map(existingScores.map((s) => [s.conversationId, s.updatedAt]));

    const tgDueConversations = tgCandidates
      .filter((c) => {
        const lastScoreAt = lastScoreByConversation.get(c.id);
        return !lastScoreAt || (c.lastMessageAt !== null && lastScoreAt < c.lastMessageAt);
      })
      .slice(0, BATCH_SIZE_PER_SCORER);

    for (const conversation of tgDueConversations) {
      try {
        await scoreChatWithScorer(conversation.id, scorer, "TELEGRAM");
        scoredAny = true;
      } catch (err) {
        console.error(`[lead-scoring] Error calificando conversación ${conversation.id} con el calificador ${scorer.id}:`, err);
      }
    }
  }

  if (scoredAny) {
    await checkBudgetAlert(scorer.userId, now);
  }

  await prisma.wALeadScorerBot.update({
    where: { id: scorer.id },
    data: { lastRunAt: now },
  });
}
