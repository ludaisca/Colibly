import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { automationChannel, findAccessibleAutomation, requireAutomationSession } from "@/lib/automations/access";
import { parseGraph } from "@/lib/automations/publish";
import { parseSettings } from "@/lib/automations/settings";
import type { Graph, TriggerType } from "@/lib/automations/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });
    const graph = a.draftGraph as unknown as Graph;
    return NextResponse.json({
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      draftGraph: graph,
      settings: parseSettings(a.settings, graph.trigger.type as TriggerType),
      channel: automationChannel(a),
      account: a.waAccount ? { id: a.waAccount.id, name: a.waAccount.name } : { id: a.channelAccount!.id, name: a.channelAccount!.name },
      waAccountId: a.waAccountId,
      channelAccountId: a.channelAccountId,
      publishedVersion: a.publishedVersion,
      // ¿El borrador difiere de lo publicado? El editor lo usa para "Cambios sin publicar".
      hasUnpublishedChanges: a.publishedVersion
        ? JSON.stringify((await prisma.automationVersion.findUnique({ where: { id: a.publishedVersion.id }, select: { graph: true } }))?.graph) !==
          JSON.stringify(a.draftGraph)
        : true,
      updatedAt: a.updatedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  draftGraph: z.unknown().optional(),
  settings: z.object({ exitOnReply: z.boolean(), allowReentry: z.boolean() }).optional(),
  // Activar/pausar. Activar exige una versión publicada; pausar no corta las
  // ejecuciones en curso, solo impide que arranquen nuevas.
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { draftGraph, status, ...rest } = parsed.data;

    let graph: Graph | undefined;
    if (draftGraph !== undefined) {
      const g = parseGraph(draftGraph);
      if (!g) return NextResponse.json({ error: "El grafo no tiene un formato válido" }, { status: 400 });
      if (JSON.stringify(g).length > 500_000) return NextResponse.json({ error: "La automatización es demasiado grande" }, { status: 400 });
      graph = g;
    }
    if (status === "ACTIVE" && !a.publishedVersionId) {
      return NextResponse.json({ error: "Publica la automatización antes de activarla" }, { status: 400 });
    }

    const updated = await prisma.automation.update({
      where: { id },
      data: {
        ...rest,
        ...(graph ? { draftGraph: graph as unknown as Prisma.InputJsonValue } : {}),
        ...(rest.settings ? { settings: rest.settings as unknown as Prisma.InputJsonValue } : {}),
        ...(status ? { status } : {}),
      },
      select: { id: true, status: true, updatedAt: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

// Borrar elimina también su historial de ejecuciones. Para conservarlo,
// archivar (PATCH status: ARCHIVED).
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });
    await prisma.automation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
