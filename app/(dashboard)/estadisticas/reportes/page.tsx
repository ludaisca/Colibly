import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRangeReport, parseReportRange } from "@/lib/estadisticas/reports";
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
  const range = parseReportRange(params.from, params.to);
  const data = await getRangeReport(session.user.id, range);

  return <ReportsView data={data} fromKey={range.fromKey} toKey={range.toKey} />;
}
