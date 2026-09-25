import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-errors";
import { automationChannel, findAccessibleAutomation, requireAutomationSession } from "@/lib/automations/access";
import { parseGraph, publishAutomation, validateForPublish } from "@/lib/automations/publish";
import { hasErrors } from "@/lib/automations/validate";

type Params = { params: Promise<{ id: string }> };

// Publica el borrador actual como nueva versión y activa la automatización.
// Las ejecuciones en curso siguen con su versión; las nuevas usan esta.
// 422 con la lista de problemas si hay errores (las advertencias no bloquean).
export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });

    const graph = parseGraph(a.draftGraph);
    if (!graph) return NextResponse.json({ error: "El grafo no tiene un formato válido" }, { status: 400 });

    const issues = await validateForPublish(graph, { waAccountId: a.waAccountId, channelAccountId: a.channelAccountId, organizationId: a.organizationId }, automationChannel(a));
    if (hasErrors(issues)) {
      return NextResponse.json({ error: "La automatización tiene errores", issues }, { status: 422 });
    }
    const published = await publishAutomation(a.id, graph, session.user.id);
    return NextResponse.json({ status: published.status, publishedVersion: published.publishedVersion, issues });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
