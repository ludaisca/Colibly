import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRangeReport, parseReportRange } from "@/lib/estadisticas/reports";
import { getActivityHeatmap } from "@/lib/estadisticas/heatmap";
import { getBotPerformance } from "@/lib/estadisticas/bot-performance";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireOrgId } from "@/lib/tenancy";
import { getOrgBusinessHours } from "@/lib/organizations";
import { ReportsView } from "./_view";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/whatsapp/chat");

  const params = await searchParams;
  const { timezone } = await getOrgBusinessHours(await requireOrgId(session.user.id));
  const range = parseReportRange(params.from, params.to, timezone);
  const [data, waAccountIds, channelAccountIds] = await Promise.all([
    getRangeReport(session.user.id, range),
    getUserAccountIds(session.user.id),
    getUserChannelAccountIds(session.user.id),
  ]);
  const [heatmap, bot] = await Promise.all([
    getActivityHeatmap({ waAccountIds, channelAccountIds }, range, timezone),
    getBotPerformance({ waAccountIds, channelAccountIds }, range),
  ]);

  return <ReportsView data={data} heatmap={heatmap} bot={bot} fromKey={range.fromKey} toKey={range.toKey} />;
}
