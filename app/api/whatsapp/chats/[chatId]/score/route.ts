import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { scoreChatWithScorer, LeadScoringError } from "@/lib/whatsapp/lead-scoring";
import { rateLimit } from "@/lib/rate-limit";

// Dueño de la cuenta del chat, no session.user.id — un usuario con acceso
// vía cuenta compartida ve/usa los calificadores del dueño de la cuenta.
async function getChatOwnerUserId(chatId: string, channel: "WHATSAPP" | "TELEGRAM"): Promise<string | null> {
  if (channel === "TELEGRAM") {
    const conversation = await prisma.conversation.findUnique({
      where: { id: chatId },
      select: { channelAccount: { select: { userId: true } } },
    });
    return conversation?.channelAccount.userId ?? null;
  }
  const chat = await prisma.wAChat.findUnique({
    where: { id: chatId },
    select: { account: { select: { userId: true } } },
  });
  return chat?.account.userId ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }
    // Lead scoring sigue sin extenderse a Messenger/Instagram (fuera de
    // alcance de esta fase, igual que campañas/plantillas ya lo están para
    // Telegram) — narrow explícito, evita que TS infiera "WHATSAPP"|"TELEGRAM"
    // incorrectamente en getChatOwnerUserId/scoreChatWithScorer más abajo.
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM" || resolved.channel === "WEBCHAT") {
      return NextResponse.json({ error: "Calificación de leads no disponible para este canal" }, { status: 400 });
    }

    const scores = await prisma.wALeadScore.findMany({
      where: resolved.channel === "TELEGRAM" ? { conversationId: chatId } : { chatId },
      include: { scorer: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(scores);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Cada llamada gasta IA: límite por usuario además del tope mensual de
    // presupuesto (que al agotarse también apaga los bots legítimos).
    const { allowed } = await rateLimit(`ai-score:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes de IA, espera un momento" }, { status: 429 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM" || resolved.channel === "WEBCHAT") {
      return NextResponse.json({ error: "Calificación de leads no disponible para este canal" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const scorerId = typeof body?.scorerId === "string" ? body.scorerId : null;
    if (!scorerId) {
      return NextResponse.json({ error: "scorerId es requerido" }, { status: 400 });
    }

    const ownerUserId = await getChatOwnerUserId(chatId, resolved.channel);
    if (!ownerUserId) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const scorer = await prisma.wALeadScorerBot.findFirst({
      where: { id: scorerId, userId: ownerUserId },
    });
    if (!scorer) {
      return NextResponse.json({ error: "Calificador no encontrado" }, { status: 404 });
    }

    try {
      const leadScore = await scoreChatWithScorer(chatId, scorer, resolved.channel);
      return NextResponse.json(leadScore);
    } catch (err) {
      if (err instanceof LeadScoringError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
