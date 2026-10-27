import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { pipelineSession } from "@/lib/pipeline/session";

const patchSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(60, "Máximo 60 caracteres"),
});

async function owned(id: string, organizationId: string) {
  return prisma.pipeline.findFirst({ where: { id, organizationId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const pipeline = await owned(id, session.organizationId);
    if (!pipeline) return NextResponse.json({ error: "Embudo no encontrado" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await prisma.pipeline.update({ where: { id }, data: { name: parsed.data.name } });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const pipeline = await owned(id, session.organizationId);
    if (!pipeline) return NextResponse.json({ error: "Embudo no encontrado" }, { status: 404 });
    if (pipeline.isDefault) {
      return NextResponse.json({ error: "El embudo principal no se puede eliminar" }, { status: 400 });
    }
    const fallback = await prisma.pipelineStage.findMany({
      where: { pipeline: { organizationId: session.organizationId, isDefault: true } },
    });
    const contacts = await prisma.contact.findMany({
      where: { pipelineStage: { pipelineId: id } },
      select: { id: true, leadStatus: true },
    });
    for (const contact of contacts) {
      const stage = fallback.find((item) => item.leadStatus === contact.leadStatus) ?? fallback[0];
      if (stage) await prisma.contact.update({ where: { id: contact.id }, data: { pipelineStageId: stage.id } });
    }
    await prisma.pipeline.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
