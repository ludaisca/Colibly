import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { PIPELINE_STAGES, STAGE_LABEL } from "@/lib/pipeline/stages";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { PipelineBoard, type BoardData } from "./_board";
import type { LeadCardData } from "@/app/components/pipeline/lead-card";

export default async function VentasPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/whatsapp/chat");

  const accountIds = await getUserAccountIds(session.user.id);

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { accountId: { in: accountIds } },
        { channelAccountId: { in: await getUserChannelAccountIds(session.user.id) } },
      ],
    },
    select: {
      id: true,
      name: true,
      remoteJid: true,
      leadStatus: true,
      accountId: true,
      tags: {
        select: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
      chat: {
        select: {
          lastMessageAt: true,
          unreadCount: true,
          leadScores: {
            orderBy: { score: "desc" },
            take: 1,
            select: { score: true, label: true },
          },
        },
      },
      conversation: {
        select: {
          lastMessageAt: true,
          unreadCount: true,
        },
      },
    },
  });

  const boardData: BoardData = {} as BoardData;
  for (const stage of PIPELINE_STAGES) {
    boardData[stage] = [];
  }

  for (const c of contacts) {
    const lastMessageAt =
      c.chat?.lastMessageAt?.toISOString() ??
      c.conversation?.lastMessageAt?.toISOString() ??
      null;
    const unreadCount =
      (c.chat?.unreadCount ?? 0) + (c.conversation?.unreadCount ?? 0);

    const card: LeadCardData = {
      id: c.id,
      name: c.name,
      remoteJid: c.remoteJid,
      leadStatus: c.leadStatus,
      accountId: c.accountId,
      tags: c.tags,
      bestScore: c.chat?.leadScores?.[0] ?? null,
      lastMessageAt,
      unreadCount,
    };

    boardData[c.leadStatus]?.push(card);
  }

  const total = contacts.length;
  const stageCounts = PIPELINE_STAGES.map((s) => boardData[s]?.length ?? 0);

  const kpis: KpiItem[] = [
    {
      label: "Total leads",
      value: String(total),
      hint: "en pipeline",
    },
    {
      label: "Nuevos",
      value: String(stageCounts[0]),
      hint: STAGE_LABEL.NEW,
    },
    {
      label: "Calificados",
      value: String(stageCounts[2]),
      hint: STAGE_LABEL.QUALIFIED,
    },
    {
      label: "Clientes",
      value: String(stageCounts[3]),
      hint: STAGE_LABEL.CUSTOMER,
    },
  ];

  const customerCount = stageCounts[3];

  const conversionPct =
    total > 0 ? Math.round((customerCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description={`${total} leads · ${conversionPct}% conversión a cliente`}
      />

      <KpiStrip items={kpis} size="hero" />

      <PipelineBoard initialData={boardData} />
    </div>
  );
}
