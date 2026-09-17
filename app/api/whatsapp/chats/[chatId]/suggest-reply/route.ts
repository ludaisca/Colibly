import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { suggestReply, ReplySuggestionError } from "@/lib/whatsapp/reply-suggestion";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";

// Copiloto de IA (roadmap P3-e) — mismo alcance de canal que /score y
// /scorers hoy: WhatsApp + Telegram, no Messenger/Instagram todavía.
async function getChatAccountId(chatId: string, channel: "WHATSAPP" | "TELEGRAM"): Promise<string | null> {
  if (channel === "TELEGRAM") {
    const conversation = await prisma.conversation.findUnique({
      where: { id: chatId },
      select: { channelAccountId: true },
    });
    return conversation?.channelAccountId ?? null;
  }
  const chat = await prisma.wAChat.findUnique({ where: { id: chatId }, select: { accountId: true } });
  return chat?.accountId ?? null;
}

// Bots disponibles como "persona" para sugerir — a propósito NO se filtra por
// isActive: un bot pausado o nunca activado en el pipeline autónomo igual
// sirve como base de prompt para una sugerencia manual, que nunca se envía sola.
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
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM" || resolved.channel === "WEBCHAT") {
      return NextResponse.json({ error: "Copiloto de IA no disponible para este canal" }, { status: 400 });
    }

    const accountId = await getChatAccountId(chatId, resolved.channel);
    if (!accountId) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const bots = await prisma.wABot.findMany({
      where: resolved.channel === "TELEGRAM" ? { channelAccountId: accountId } : { waAccountId: accountId },
      select: { id: true, name: true, provider: true, model: true, isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(bots);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
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
    const { allowed } = await rateLimit(`ai-suggest-reply:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes de IA, espera un momento" }, { status: 429 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }
    if (resolved.channel === "MESSENGER" || resolved.channel === "INSTAGRAM" || resolved.channel === "WEBCHAT") {
      return NextResponse.json({ error: "Copiloto de IA no disponible para este canal" }, { status: 400 });
    }

    const accountId = await getChatAccountId(chatId, resolved.channel);
    if (!accountId) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const botId = typeof body?.botId === "string" ? body.botId : null;
    if (!botId) {
      return NextResponse.json({ error: "botId es requerido" }, { status: 400 });
    }

    const bot = await prisma.wABot.findFirst({
      where: resolved.channel === "TELEGRAM" ? { id: botId, channelAccountId: accountId } : { id: botId, waAccountId: accountId },
    });
    if (!bot) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    try {
      const result = await suggestReply(chatId, bot, resolved.channel);
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof ReplySuggestionError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
