import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { ensureDefaultPipeline } from "@/lib/pipeline/ensure";
import { SampleDataControls } from "@/app/components/ui/sample-data-controls";
import { PageHeader } from "@/app/components/ui/page-header";
import { Button } from "@/app/components/ui/button";
import { DismissibleNudge } from "@/app/components/ui/dismissible-nudge";
import { staleCutoff } from "@/lib/pipeline/nudge";
import { STALL_WARN_DAYS } from "@/lib/pipeline/card-signal";
import { plural } from "@/lib/format/plural";
import { PipelineBoard, type BoardData, type BoardStage, type StageTotals } from "./_board";
import { countStaleCards, loadStageCards, stageSummaries } from "@/lib/pipeline/board";
import { formatMxn } from "@/lib/money";

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ pipeline?: string; detenidos?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/whatsapp/chat");

  const organizationId = await requireOrgId(session.user.id);
  await ensureDefaultPipeline(organizationId);
  const { pipeline: requestedId, detenidos } = await searchParams;
  const pipelines = await prisma.pipeline.findMany({
    where: { organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: { position: "asc" } } },
  });
  const selected = pipelines.find((item) => item.id === requestedId) ?? pipelines.find((item) => item.isDefault) ?? pipelines[0];
  if (!selected) redirect("/ventas");

  const scope = await contactScopeWhere(session.user.id);
  const stages: BoardStage[] = selected.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    outcome: stage.outcome,
    locked: stage.leadStatus !== null,
  }));

  // Leads detenidos: más de un día en la primera etapa abierta sin moverse
  // (stageEnteredAt lo mantiene un trigger de la base). Con ?detenidos=1 esa
  // columna muestra solo esos.
  const firstStage = selected.stages.find((stage) => stage.outcome === "OPEN");
  const cutoff = staleCutoff(new Date());
  const onlyStale = detenidos === "1" && !!firstStage;

  // Cada columna trae su primera página; conteos y sumas salen de la base
  // (lib/pipeline/board.ts). Todo en paralelo.
  // Tratos abiertos sin moverse en más de STALL_WARN_DAYS días (línea de resumen).
  const stallCutoff = staleCutoff(new Date(), STALL_WARN_DAYS * 24);
  const openStages = selected.stages.filter((stage) => stage.outcome === "OPEN");
  const [summaries, staleCount, stalledOpen, columns] = await Promise.all([
    stageSummaries(scope, selected.stages, selected.isDefault),
    firstStage ? countStaleCards(scope, firstStage, selected.isDefault, cutoff) : Promise.resolve(0),
    Promise.all(openStages.map((stage) => countStaleCards(scope, stage, selected.isDefault, stallCutoff))).then((counts) => counts.reduce((a, b) => a + b, 0)),
    Promise.all(
      selected.stages.map((stage) =>
        loadStageCards({
          scope,
          stage,
          isDefault: selected.isDefault,
          staleBefore: onlyStale && stage.id === firstStage?.id ? cutoff : undefined,
        })
      )
    ),
  ]);
  const boardData: BoardData = {};
  const stageTotals: StageTotals = {};
  selected.stages.forEach((stage, index) => {
    boardData[stage.id] = columns[index];
    const filtered = onlyStale && stage.id === firstStage?.id;
    stageTotals[stage.id] = filtered
      ? { count: staleCount, valueCents: columns[index].reduce((sum, card) => sum + (card.dealValueCents ?? 0), 0), partialValue: true }
      : { count: summaries[stage.id].count, valueCents: summaries[stage.id].valueCents };
  });

  // El resumen cuenta solo lo real: las tarjetas de ejemplo se ven en el tablero pero no suman.
  const openCount = openStages.reduce((sum, stage) => sum + summaries[stage.id].realCount, 0);
  const openValue = openStages.reduce((sum, stage) => sum + summaries[stage.id].realValueCents, 0);
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const outcomes = await prisma.leadOutcomeEvent.groupBy({
    by: ["outcome"],
    where: { organizationId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const won30 = outcomes.find((row) => row.outcome === "WON")?._count._all ?? 0;
  const lost30 = outcomes.find((row) => row.outcome === "LOST")?._count._all ?? 0;

  // Una línea de resumen en lugar de cuatro tarjetas KPI (dirección congelada).
  const summary = [
    plural(openCount, "trato abierto", "tratos abiertos"),
    `${formatMxn(openValue)} en juego`,
    `${plural(won30, "ganado", "ganados")} y ${plural(lost30, "perdido", "perdidos")} en 30 días`,
    `${stalledOpen.toLocaleString("es-MX")} sin movimiento en más de ${STALL_WARN_DAYS} días`,
  ].join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader title="Embudo" hint="funnel" description={summary} actions={<SampleDataControls />} />
      {onlyStale ? (
        <p className="text-sm text-muted-darker">
          «{firstStage?.name}» muestra solo los contactos con más de un día sin moverse.{" "}
          <Link href={`/ventas?pipeline=${selected.id}`} className="font-medium text-accent-ink underline underline-offset-2">Ver todos</Link>
        </p>
      ) : staleCount > 0 && firstStage ? (
        <DismissibleNudge
          id={`embudo-detenidos:${selected.id}`}
          title={`Tienes ${staleCount.toLocaleString("es-MX")} ${staleCount === 1 ? "contacto" : "contactos"} en ${firstStage.name} desde hace más de un día`}
          action={<Button href={`/ventas?pipeline=${selected.id}&detenidos=1`} size="sm" variant="secondary">Ver esos contactos</Button>}
        >
          Muévelos a la siguiente etapa para no perderlos.
        </DismissibleNudge>
      ) : null}
      <PipelineBoard
        pipelines={pipelines.map((item) => ({ id: item.id, name: item.name, isDefault: item.isDefault }))}
        pipelineId={selected.id}
        stages={stages}
        initialData={boardData}
        initialTotals={stageTotals}
        onlyStaleStageId={onlyStale ? firstStage?.id ?? null : null}
      />
    </div>
  );
}
