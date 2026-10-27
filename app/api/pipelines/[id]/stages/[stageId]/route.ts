import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { afterLeadStatusChanged } from "@/lib/contacts/side-effects";
import { leadStatusForStage, type StageOutcome } from "@/lib/pipeline/stages";
import { pipelineSession } from "@/lib/pipeline/session";

const MAX_STAGES = 20;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  outcome: z.enum(["OPEN", "WON", "LOST"]).optional(),
  position: z.number().int().min(0).max(MAX_STAGES).optional(),
});

async function syncContacts(stageId: string, outcome: StageOutcome, leadStatus: LeadStatus | null) {
  const contacts = await prisma.contact.findMany({
    where: { pipelineStageId: stageId },
    select: { id: true, leadStatus: true, leadOrigin: true },
  });
  for (const contact of contacts) {
    const next = leadStatusForStage({ outcome, leadStatus }, contact.leadStatus);
    if (next === contact.leadStatus) continue;
    await prisma.contact.update({ where: { id: contact.id }, data: { leadStatus: next } });
    await afterLeadStatusChanged(contact, contact.leadStatus, next);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id, stageId } = await params;
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipeline: { id, organizationId: session.organizationId } },
    });
    if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.outcome !== undefined ? { outcome: parsed.data.outcome } : {}),
        ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
      },
    });
    if (parsed.data.outcome && parsed.data.outcome !== stage.outcome) {
      await syncContacts(stageId, updated.outcome, updated.leadStatus);
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  try {
    const session = await pipelineSession();
    if (session instanceof NextResponse) return session;
    const { id, stageId } = await params;
    const stages = await prisma.pipelineStage.findMany({
      where: { pipeline: { id, organizationId: session.organizationId } },
      orderBy: { position: "asc" },
    });
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
    if (stage.leadStatus) {
      return NextResponse.json({ error: "Las etapas del embudo principal que ya usan un estado no se eliminan. Puedes cambiarles el nombre." }, { status: 400 });
    }
    if (stages.length <= 1) return NextResponse.json({ error: "El embudo necesita al menos una etapa" }, { status: 400 });
    const index = stages.findIndex((item) => item.id === stageId);
    const target = stages[index - 1] ?? stages[index + 1];
    const contacts = await prisma.contact.findMany({
      where: { pipelineStageId: stageId },
      select: { id: true, leadStatus: true, leadOrigin: true },
    });
    for (const contact of contacts) {
      const next = leadStatusForStage(target, contact.leadStatus);
      await prisma.contact.update({ where: { id: contact.id }, data: { pipelineStageId: target.id, leadStatus: next } });
      if (next !== contact.leadStatus) await afterLeadStatusChanged(contact, contact.leadStatus, next);
    }
    await prisma.pipelineStage.delete({ where: { id: stageId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
