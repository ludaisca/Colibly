import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { pipelineSession } from "@/lib/pipeline/session";

const MAX_STAGES = 20;

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(40, "Máximo 40 caracteres"),
  outcome: z.enum(["OPEN", "WON", "LOST"]).default("OPEN"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const pipeline = await prisma.pipeline.findFirst({
      where: { id, organizationId: session.organizationId },
      include: { stages: true },
    });
    if (!pipeline) return NextResponse.json({ error: "Embudo no encontrado" }, { status: 404 });
    if (pipeline.stages.length >= MAX_STAGES) {
      return NextResponse.json({ error: `Un embudo admite hasta ${MAX_STAGES} etapas` }, { status: 400 });
    }
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const position = pipeline.stages.reduce((max, stage) => Math.max(max, stage.position), -1) + 1;
    const stage = await prisma.pipelineStage.create({
      data: { pipelineId: id, name: parsed.data.name, outcome: parsed.data.outcome, position },
    });
    return NextResponse.json(stage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
