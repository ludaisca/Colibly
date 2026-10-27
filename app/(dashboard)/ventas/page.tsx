import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { ensureDefaultPipeline } from "@/lib/pipeline/ensure";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { PipelineBoard, type BoardData, type BoardStage } from "./_board";
import type { LeadCardData } from "@/app/components/pipeline/lead-card";

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ pipeline?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/whatsapp/chat");

  const organizationId = await requireOrgId(session.user.id);
  await ensureDefaultPipeline(organizationId);
  const { pipeline: requestedId } = await searchParams;
  const pipelines = await prisma.pipeline.findMany({
    where: { organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: { position: "asc" } } },
  });
  const selected = pipelines.find((item) => item.id === requestedId) ?? pipelines.find((item) => item.isDefault) ?? pipelines[0];
  if (!selected) redirect("/ventas");

  const accountIds = await getUserAccountIds(session.user.id);
  const channelAccountIds = await getUserChannelAccountIds(session.user.id);
  const stageIds = selected.stages.map((stage) => stage.id);
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { pipelineStageId: { in: stageIds } },
        ...(selected.isDefault
          ? [{ pipelineStageId: null, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] }]
          : []),
      ],
      AND: [{ OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] }],
    },
    select: {
      id: true,
      name: true,
      remoteJid: true,
      leadStatus: true,
      pipelineStageId: true,
      accountId: true,
      channelAccount: { select: { channel: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      chat: {
        select: {
          lastMessageAt: true,
          unreadCount: true,
          leadScores: { orderBy: { score: "desc" }, take: 1, select: { score: true, label: true } },
        },
      },
      conversation: { select: { lastMessageAt: true, unreadCount: true } },
    },
  });

  const stages: BoardStage[] = selected.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    outcome: stage.outcome,
    locked: stage.leadStatus !== null,
  }));
  const boardData: BoardData = {};
  for (const stage of stages) boardData[stage.id] = [];

  for (const contact of contacts) {
    const stageId = contact.pipelineStageId ?? selected.stages.find((stage) => stage.leadStatus === contact.leadStatus)?.id;
    if (!stageId || !boardData[stageId]) continue;
    const card: LeadCardData = {
      id: contact.id,
      name: contact.name,
      remoteJid: contact.remoteJid,
      leadStatus: contact.leadStatus,
      stageId,
      accountId: contact.accountId,
      channel: contact.accountId ? "WHATSAPP" : contact.channelAccount?.channel ?? "WEBCHAT",
      tags: contact.tags,
      bestScore: contact.chat?.leadScores?.[0] ?? null,
      lastMessageAt: contact.chat?.lastMessageAt?.toISOString() ?? contact.conversation?.lastMessageAt?.toISOString() ?? null,
      unreadCount: (contact.chat?.unreadCount ?? 0) + (contact.conversation?.unreadCount ?? 0),
    };
    boardData[stageId].push(card);
  }

  const total = Object.values(boardData).reduce((sum, cards) => sum + cards.length, 0);
  const wonOnBoard = selected.stages.filter((stage) => stage.outcome === "WON").reduce((sum, stage) => sum + boardData[stage.id].length, 0);
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const outcomes = await prisma.leadOutcomeEvent.groupBy({
    by: ["outcome"],
    where: { organizationId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const won30 = outcomes.find((row) => row.outcome === "WON")?._count._all ?? 0;
  const lost30 = outcomes.find((row) => row.outcome === "LOST")?._count._all ?? 0;
  const conversionPct = total > 0 ? Math.round((wonOnBoard / total) * 100) : 0;

  const kpis: KpiItem[] = [
    { label: "Leads en este embudo", value: String(total), hint: selected.name },
    { label: "Ganados", value: String(wonOnBoard), hint: "en el embudo ahora" },
    { label: "Ganados en 30 días", value: String(won30), hint: "pasaron a cliente" },
    { label: "Perdidos en 30 días", value: String(lost30), hint: "pasaron a perdido" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description={`${pipelines.length} ${pipelines.length === 1 ? "embudo" : "embudos"} · ${conversionPct}% en etapas ganadas`}
      />
      <KpiStrip items={kpis} size="hero" />
      <PipelineBoard
        pipelines={pipelines.map((item) => ({ id: item.id, name: item.name, isDefault: item.isDefault }))}
        pipelineId={selected.id}
        stages={stages}
        initialData={boardData}
      />
    </div>
  );
}
