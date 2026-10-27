import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPlanLimit } from "@/lib/billing/gates";
import { publicErrorMessage } from "@/lib/api-errors";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { pipelineSession } from "@/lib/pipeline/session";

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(60, "Máximo 60 caracteres"),
});

export async function GET() {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const pipelines = await prisma.pipeline.findMany({
      where: { organizationId: session.organizationId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { stages: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json(pipelines);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const over = await checkPlanLimit(session.organizationId, "funnels");
    if (over) return over;

    const count = await prisma.pipeline.count({ where: { organizationId: session.organizationId } });
    const pipeline = await prisma.pipeline.create({
      data: {
        organizationId: session.organizationId,
        name: parsed.data.name,
        position: count,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
            name: stage.name,
            position: stage.position,
            outcome: stage.outcome,
          })),
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json(pipeline, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
