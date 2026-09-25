import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { findRunForUser } from "@/lib/automations/chat-access";
import { deliverInput } from "@/lib/automations/runner";

type Params = { params: Promise<{ runId: string }> };

// Línea de tiempo de una ejecución (registro de cada paso).
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { runId } = await params;
    const run = await findRunForUser(runId, session.user.id);
    if (!run) return NextResponse.json({ error: "Ejecución no encontrada" }, { status: 404 });
    const logs = await prisma.automationRunLog.findMany({ where: { runId }, orderBy: { at: "asc" }, take: 500 });
    return NextResponse.json({
      id: run.id,
      status: run.status,
      automation: run.automation,
      currentNodeId: run.currentNodeId,
      vars: run.vars,
      lastError: run.lastError,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      nextRunAt: run.nextRunAt,
      logs: logs.map((l) => ({ id: l.id, nodeId: l.nodeId, nodeType: l.nodeType, outcome: l.outcome, detail: l.detail, at: l.at })),
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

const actionSchema = z.object({ action: z.enum(["pause", "resume", "cancel"]) });

// Pausar / reanudar / terminar desde el chat. Reanudar sigue de inmediato (si
// estaba esperando respuesta, vuelve a esperarla).
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { runId } = await params;
    const run = await findRunForUser(runId, session.user.id);
    if (!run) return NextResponse.json({ error: "Ejecución no encontrada" }, { status: 404 });
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Acción no válida" }, { status: 400 });

    const live = ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY", "PAUSED_BY_AGENT"].includes(run.status);
    if (!live) return NextResponse.json({ error: "La ejecución ya terminó" }, { status: 400 });

    switch (parsed.data.action) {
      case "pause":
        await prisma.automationRun.update({ where: { id: runId }, data: { status: "PAUSED_BY_AGENT", nextRunAt: null } });
        break;
      case "resume":
        if (run.status !== "PAUSED_BY_AGENT") return NextResponse.json({ error: "La ejecución no está pausada" }, { status: 400 });
        await deliverInput(runId, { kind: "resume" });
        break;
      case "cancel":
        await prisma.automationRun.update({ where: { id: runId }, data: { status: "CANCELLED", endedAt: new Date(), nextRunAt: null } });
        break;
    }
    await prisma.automationRunLog.create({
      data: { runId, nodeId: null, nodeType: "agent", outcome: "ok", detail: `${parsed.data.action === "pause" ? "Pausada" : parsed.data.action === "resume" ? "Reanudada" : "Terminada"} por ${session.user.name ?? "un agente"}` },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
