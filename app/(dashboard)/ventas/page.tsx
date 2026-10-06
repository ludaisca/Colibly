import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/crm/access";
import { getBoard } from "@/lib/crm/deals";
import { formatMoney } from "@/lib/pipeline/format";
import type { BoardResponse } from "@/lib/pipeline/types";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { PipelineBoard } from "./_board";

export default async function VentasPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/whatsapp/chat");

  const actor = await getActor();
  // Pasa a JSON plano (fechas ISO, importes numéricos) antes de cruzar al cliente.
  const board = JSON.parse(JSON.stringify(await getBoard(actor, {}))) as BoardResponse;

  const open = board.columns.filter((c) => c.stage.outcome === "OPEN");
  const won = board.columns.filter((c) => c.stage.outcome === "WON");
  const sum = (cols: typeof open, k: "count" | "amount" | "weighted") => cols.reduce((n, c) => n + c[k], 0);
  const money = (n: number) => formatMoney(n, board.currency);

  const kpis: KpiItem[] = [
    { label: "Negocios abiertos", value: String(sum(open, "count")), hint: board.pipeline.name },
    { label: "Importe abierto", value: money(sum(open, "amount")), hint: "en juego" },
    { label: "Pronóstico", value: money(sum(open, "weighted")), hint: "ponderado por probabilidad" },
    { label: "Ganados", value: String(sum(won, "count")), hint: money(sum(won, "amount")) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline" description="Arrastra los negocios entre etapas; ganar o perder uno lo cierra." />
      <KpiStrip items={kpis} size="hero" />
      <PipelineBoard initialBoard={board} />
    </div>
  );
}
