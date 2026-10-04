import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { resolveChatForAutomations } from "@/lib/automations/chat-access";
import { LIVE_STATUSES, startRun } from "@/lib/automations/runner";
import { GraphIndex } from "@/lib/automations/graph";
import { stepLabel } from "@/lib/automations/labels";
import type { Graph } from "@/lib/automations/types";

type Params = { params: Promise<{ chatId: string }> };

// Chip del inbox: ejecuciones vivas del chat (con el paso en que van) y las
// automatizaciones manuales que se pueden iniciar a mano.
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const ctx = await resolveChatForAutomations(chatId, session.user.id);
    if (!ctx) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

    const runs = await prisma.automationRun.findMany({
      where: { ...(ctx.chat.kind === "whatsapp" ? { waChatId: chatId } : { conversationId: chatId }), status: { in: LIVE_STATUSES } },
      orderBy: { startedAt: "desc" },
      include: { automation: { select: { id: true, name: true } }, version: { select: { graph: true } } },
    });
    const manual = await prisma.automation.findMany({
      where: {
        ...(ctx.account.kind === "whatsapp" ? { waAccountId: ctx.account.id } : { channelAccountId: ctx.account.id }),
        status: "ACTIVE",
        triggerType: "manual",
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      runs: runs.map((r) => {
        const step = r.currentNodeId ? new GraphIndex(r.version.graph as unknown as Graph).get(r.currentNodeId) : null;
        return {
          id: r.id,
          status: r.status,
          automation: r.automation,
          step: step ? stepLabel(step) : null,
          nextRunAt: r.nextRunAt,
        };
      }),
      manual,
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

const startSchema = z.object({ automationId: z.string().min(1) });

// Inicio manual desde el chat.
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const ctx = await resolveChatForAutomations(chatId, session.user.id);
    if (!ctx || !ctx.contactId) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    const parsed = startSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Automatización no válida" }, { status: 400 });

    const automation = await prisma.automation.findFirst({
      where: {
        id: parsed.data.automationId,
        ...(ctx.account.kind === "whatsapp" ? { waAccountId: ctx.account.id } : { channelAccountId: ctx.account.id }),
        triggerType: "manual",
      },
      select: { id: true },
    });
    if (!automation) return NextResponse.json({ error: "Automatización no encontrada para este chat" }, { status: 404 });

    const result = await startRun({ automationId: automation.id, contactId: ctx.contactId, account: ctx.account, chat: ctx.chat, force: true });
    if (!result.started) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ runId: result.runId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
