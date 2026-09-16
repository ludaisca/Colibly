import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { CHAT_ATTRIBUTION_MESSAGE_QUERY, resolveChatAttribution } from "@/lib/whatsapp/chat-attribution";
import type { LeadScoreRow } from "@/lib/whatsapp/export-columns";

const TAKE = 500;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accountIds = await getUserAccountIds(session.user.id);
    const channelAccountIds = await getUserChannelAccountIds(session.user.id);

    const waScores = await prisma.wALeadScore.findMany({
      where: { chatId: { not: null }, chat: { accountId: { in: accountIds } } },
      include: {
        scorer: { select: { id: true, name: true } },
        chat: {
          select: {
            id: true,
            name: true,
            remoteJid: true,
            status: true,
            accountId: true,
            account: { select: { id: true, name: true } },
            contact: { select: { realName: true } },
            messages: CHAT_ATTRIBUTION_MESSAGE_QUERY,
          },
        },
      },
      orderBy: { score: "desc" },
      take: TAKE,
    });

    const waRows: LeadScoreRow[] = waScores.map((s) => {
      const chat = s.chat!;
      return {
        id: s.id,
        score: s.score,
        label: s.label,
        summary: s.summary,
        reasons: s.reasons,
        details: s.details as LeadScoreRow["details"],
        updatedAt: s.updatedAt.toISOString(),
        scorer: s.scorer,
        campaign: resolveChatAttribution(chat.messages),
        channel: "WHATSAPP",
        chat: {
          id: chat.id,
          name: chat.name,
          identifier: chat.remoteJid,
          status: chat.status,
          accountId: chat.accountId,
          account: chat.account,
          contact: chat.contact,
        },
      };
    });

    // Telegram no tiene campañas/automatizaciones (exclusivo de Meta) —
    // campaign siempre null. Sin include posible sobre la referencia blanda
    // (conversationId), así que los datos de display van en una query aparte.
    const tgConversations = channelAccountIds.length > 0
      ? await prisma.conversation.findMany({
          where: { channelAccountId: { in: channelAccountIds } },
          select: {
            id: true, name: true, externalId: true, status: true, channelAccountId: true,
            channelAccount: { select: { id: true, name: true } },
            contact: { select: { realName: true } },
          },
        })
      : [];
    const tgConversationById = new Map(tgConversations.map((c) => [c.id, c]));

    const tgScores = tgConversations.length > 0
      ? await prisma.wALeadScore.findMany({
          where: { conversationId: { in: tgConversations.map((c) => c.id) } },
          include: { scorer: { select: { id: true, name: true } } },
          orderBy: { score: "desc" },
          take: TAKE,
        })
      : [];

    const tgRows: LeadScoreRow[] = tgScores.flatMap((s) => {
      const conversation = s.conversationId ? tgConversationById.get(s.conversationId) : undefined;
      if (!conversation) return [];
      return [{
        id: s.id,
        score: s.score,
        label: s.label,
        summary: s.summary,
        reasons: s.reasons,
        details: s.details as LeadScoreRow["details"],
        updatedAt: s.updatedAt.toISOString(),
        scorer: s.scorer,
        campaign: null,
        channel: "TELEGRAM" as const,
        chat: {
          id: conversation.id,
          name: conversation.name,
          identifier: conversation.externalId,
          status: conversation.status,
          accountId: conversation.channelAccountId,
          account: conversation.channelAccount,
          contact: conversation.contact,
        },
      }];
    });

    const rows = [...waRows, ...tgRows]
      .sort((a, b) => b.score - a.score)
      .slice(0, TAKE);

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
