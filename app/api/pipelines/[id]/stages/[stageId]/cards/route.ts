import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { pipelineSession } from "@/lib/pipeline/session";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { CARD_PAGE, loadStageCards } from "@/lib/pipeline/board";
import { staleCutoff } from "@/lib/pipeline/nudge";

// «Cargar más» de una columna del embudo: la siguiente página de tarjetas.
// ?skip=N (las que ya tiene la columna) y ?detenidos=1 (solo los leads con
// más de un día en la etapa, como el filtro del aviso).
export async function GET(req: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id, stageId } = await params;
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipeline: { id, organizationId: session.organizationId } },
      select: { id: true, leadStatus: true, outcome: true, pipeline: { select: { isDefault: true } } },
    });
    if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });

    const url = new URL(req.url);
    const skip = Math.min(Math.max(Number(url.searchParams.get("skip")) || 0, 0), 100_000);
    const cards = await loadStageCards({
      scope: await contactScopeWhere(session.userId),
      stage,
      isDefault: stage.pipeline.isDefault,
      skip,
      take: CARD_PAGE,
      staleBefore: url.searchParams.get("detenidos") === "1" ? staleCutoff(new Date()) : undefined,
    });
    return NextResponse.json({ cards, hasMore: cards.length === CARD_PAGE });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudieron cargar los leads") }, { status: 500 });
  }
}
