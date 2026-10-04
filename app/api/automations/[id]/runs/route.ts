import { NextResponse } from "next/server";
import type { AutomationRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { findAccessibleAutomation, requireAutomationSession } from "@/lib/automations/access";

type Params = { params: Promise<{ id: string }> };

const STATUSES: AutomationRunStatus[] = [
  "ACTIVE", "WAITING_DELAY", "WAITING_REPLY", "PAUSED_BY_AGENT", "HANDED_OFF", "HANDED_TO_BOT",
  "COMPLETED", "EXITED_REPLY", "EXPIRED", "FAILED", "CANCELLED",
];

// Últimas 200 ejecuciones (filtro opcional ?status=A,B).
export async function GET(req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });

    const statusParam = new URL(req.url).searchParams.get("status");
    const statuses = statusParam?.split(",").filter((s): s is AutomationRunStatus => STATUSES.includes(s as AutomationRunStatus));

    const runs = await prisma.automationRun.findMany({
      where: { automationId: id, ...(statuses?.length ? { status: { in: statuses } } : {}) },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        currentNodeId: true,
        nextRunAt: true,
        lastError: true,
        startedAt: true,
        endedAt: true,
        waChatId: true,
        conversationId: true,
        version: { select: { version: true } },
        contact: { select: { id: true, name: true, realName: true, remoteJid: true } },
      },
    });
    return NextResponse.json(
      runs.map((r) => ({
        id: r.id,
        status: r.status,
        currentNodeId: r.currentNodeId,
        nextRunAt: r.nextRunAt,
        lastError: r.lastError,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        version: r.version.version,
        chatId: r.waChatId ?? r.conversationId,
        accountId: a.waAccountId ?? a.channelAccountId,
        contact: { id: r.contact.id, name: r.contact.realName ?? r.contact.name ?? r.contact.remoteJid },
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
